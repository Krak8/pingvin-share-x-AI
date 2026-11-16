import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import * as crypto from "crypto";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";

export type WebhookEvent = "share.created" | "share.downloaded" | "share.test";

// Don't spam the webhook if a share is downloaded many times in a row
const DOWNLOAD_COOLDOWN_MS = 60 * 1000;

/**
 * Sends notifications to a webhook URL configured by the admin. Discord and
 * Slack incoming webhooks are detected by their URL and get a plain message,
 * everything else receives a JSON payload that is signed with HMAC-SHA256
 * (header `X-Pingvin-Signature`) if a secret is configured.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly lastDownloadNotification = new Map<string, number>();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  private isActive(event: WebhookEvent): boolean {
    if (!this.config.get("integrations.webhookEnabled")) return false;
    if (!this.config.get("integrations.webhookUrl")) return false;
    return event === "share.created"
      ? this.config.get("integrations.webhookOnShareCreated")
      : this.config.get("integrations.webhookOnDownload");
  }

  async notifyShareCreated(shareId: string) {
    try {
      if (!this.isActive("share.created")) return;

      const share = await this.getShareSummary(shareId);
      if (!share) return;

      await this.send(
        "share.created",
        { share },
        this.describe("created", share),
      );
    } catch (e) {
      this.logger.error(`Webhook for new share ${shareId} failed`, e);
    }
  }

  async notifyDownload(shareId: string, fileName?: string) {
    try {
      if (!this.isActive("share.downloaded")) return;

      const last = this.lastDownloadNotification.get(shareId) ?? 0;
      if (Date.now() - last < DOWNLOAD_COOLDOWN_MS) return;
      this.lastDownloadNotification.set(shareId, Date.now());
      this.pruneCooldowns();

      const share = await this.getShareSummary(shareId);
      if (!share) return;

      await this.send(
        "share.downloaded",
        { share, fileName: fileName ?? null },
        this.describe("downloaded", share, fileName),
      );
    } catch (e) {
      this.logger.error(`Webhook for download of ${shareId} failed`, e);
    }
  }

  private pruneCooldowns() {
    if (this.lastDownloadNotification.size < 1000) return;
    const cutoff = Date.now() - DOWNLOAD_COOLDOWN_MS;
    for (const [id, time] of this.lastDownloadNotification) {
      if (time < cutoff) this.lastDownloadNotification.delete(id);
    }
  }

  private async getShareSummary(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: {
        creator: { select: { username: true } },
        files: { select: { size: true } },
      },
    });
    if (!share) return null;

    return {
      id: share.id,
      name: share.name,
      url: `${this.config.get("general.appUrl")}/share/${share.id}`,
      createdBy: share.creator?.username ?? null,
      fileCount: share.files.length,
      size: share.files.reduce((sum, f) => sum + parseInt(f.size), 0),
      expiration: share.expiration,
    };
  }

  private describe(
    action: "created" | "downloaded",
    share: { name: string | null; id: string; url: string; fileCount: number },
    fileName?: string,
  ) {
    const title = share.name || share.id;
    const files = `${share.fileCount} file${share.fileCount === 1 ? "" : "s"}`;
    return action === "created"
      ? `New share "${title}" (${files}): ${share.url}`
      : `Share "${title}" was downloaded${fileName ? ` (${fileName})` : ""}: ${share.url}`;
  }

  /**
   * Sends a test message to the configured URL and reports the outcome. In
   * contrast to real notifications this doesn't swallow errors, so the admin
   * sees what is wrong.
   */
  async sendTest(): Promise<{ ok: true; status: number }> {
    if (!this.config.get("integrations.webhookUrl")) {
      throw new BadRequestException(this.i18n.t("config.webhookUrlNotSet"));
    }

    const appName = this.config.get("general.appName");
    const status = await this.deliver(
      "share.test",
      { share: null },
      `Test notification from ${appName}. Your webhook is working.`,
    );

    if (status < 200 || status >= 300) {
      throw new InternalServerErrorException(
        this.i18n.t("config.webhookStatus", { args: { status } }),
      );
    }
    return { ok: true, status };
  }

  private async send(
    event: WebhookEvent,
    data: Record<string, unknown>,
    text: string,
  ) {
    try {
      const status = await this.deliver(event, data, text);
      if (status < 200 || status >= 300) {
        this.logger.warn(`Webhook responded with status ${status}`);
      }
    } catch (e) {
      this.logger.warn(
        `Webhook delivery failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Delivers one message and returns the HTTP status. Throws on failure. */
  private async deliver(
    event: WebhookEvent,
    data: Record<string, unknown>,
    text: string,
  ): Promise<number> {
    const url: string = this.config.get("integrations.webhookUrl");
    const secret: string = this.config.get("integrations.webhookSecret");
    const appName = this.config.get("general.appName");

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(this.i18n.t("config.webhookUrlInvalid"));
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new BadRequestException(this.i18n.t("config.webhookUrlInvalid"));
    }

    const isDiscord =
      /(^|\.)discord(app)?\.com$/.test(parsed.hostname) &&
      parsed.pathname.startsWith("/api/webhooks/");
    const isSlack = parsed.hostname === "hooks.slack.com";

    const body = JSON.stringify(
      isDiscord
        ? { username: appName, content: text }
        : isSlack
          ? { text }
          : {
              event,
              timestamp: new Date().toISOString(),
              instance: this.config.get("general.appUrl"),
              text,
              data,
            },
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `${appName}-Webhook`,
    };
    if (secret && !isDiscord && !isSlack) {
      headers["X-Pingvin-Signature"] =
        "sha256=" +
        crypto.createHmac("sha256", secret).update(body).digest("hex");
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });

    return response.status;
  }
}
