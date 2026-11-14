import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  StreamableFile,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import * as contentDisposition from "content-disposition";
import { Request, Response } from "express";
import * as mime from "mime-types";
import * as moment from "moment";
import { LocalFileService } from "./local.service";
import { S3FileService } from "./s3.service";
import { ConfigService } from "src/config/config.service";
import { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "src/email/email.service";
import { I18nService } from "nestjs-i18n";
import { WebhookService } from "src/webhook/webhook.service";

const UPDATED_AT_THROTTLE_MS = 5 * 60 * 1000;
const DOWNLOAD_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

// Pre-signed S3 URLs are valid for 5 minutes. A one-time share on S3 is only
// removed after that so the redirect that was just issued still works.
const S3_ONE_TIME_DELETE_DELAY_MS = 6 * 60 * 1000;

export function getMimeType(fileName: string): string {
  return mime?.lookup?.(fileName) || "application/octet-stream";
}

/** Media a browser can safely render inline (SVG is excluded as it can run scripts) */
export function isPassiveMedia(mimeType: string): boolean {
  return (
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") ||
    mimeType === "text/plain"
  );
}

@Injectable()
export class FileService {
  constructor(
    private prisma: PrismaService,
    private localFileService: LocalFileService,
    private s3FileService: S3FileService,
    private configService: ConfigService,
    private emailService: EmailService,
    private readonly i18n: I18nService,
    private webhookService: WebhookService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}
  private readonly logger = new Logger(FileService.name);

  // Determine which service to use based on the current config value
  // shareId is optional -> can be used to overwrite a storage provider
  private getStorageService(
    storageProvider?: string,
  ): S3FileService | LocalFileService {
    if (storageProvider != undefined)
      return storageProvider == "S3"
        ? this.s3FileService
        : this.localFileService;
    return this.configService.get("s3.enabled")
      ? this.s3FileService
      : this.localFileService;
  }

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: {
      id?: string;
      name: string;
    },
    shareId: string,
  ) {
    await this.touchShare(shareId);
    const storageService = this.getStorageService();
    return storageService.create(data, chunk, file, shareId);
  }

  private async touchShare(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { updatedAt: true },
    });
    if (!share) return;
    if (
      share.updatedAt &&
      Date.now() - share.updatedAt.getTime() < UPDATED_AT_THROTTLE_MS
    )
      return;
    await this.prisma.share.update({
      where: { id: shareId },
      data: { updatedAt: new Date() },
    });
  }

  async createPreSignedUploadUrls(
    shareId: string,
    fileName: string,
    totalChunks: number,
  ) {
    await this.touchShare(shareId);
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      return { directToS3: false };
    }
    const res = await this.s3FileService.createPreSignedUploadUrls(
      shareId,
      fileName,
      totalChunks,
    );
    return { directToS3: true, ...res };
  }

  async completePreSignedUpload(
    shareId: string,
    fileId: string,
    fileName: string,
    uploadId: string,
    parts: Array<{ ETag: string; PartNumber: number }>,
  ) {
    await this.touchShare(shareId);
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      throw new BadRequestException(this.i18n.t("file.s3NotSupported"));
    }
    return this.s3FileService.completePreSignedUpload(
      shareId,
      fileId,
      fileName,
      uploadId,
      parts,
    );
  }

  async abortPreSignedUpload(
    shareId: string,
    fileName: string,
    uploadId: string,
  ) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      throw new BadRequestException(this.i18n.t("file.s3NotSupported"));
    }
    return this.s3FileService.abortPreSignedUpload(shareId, fileName, uploadId);
  }

  async getPreSignedDownloadUrl(
    shareId: string,
    fileId: string,
    isDownload: boolean,
  ): Promise<string> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    if (share?.storageProvider !== "S3") {
      throw new BadRequestException(this.i18n.t("file.s3NotSupported"));
    }
    return this.s3FileService.getPreSignedDownloadUrl(
      shareId,
      fileId,
      isDownload,
    );
  }

  async get(
    shareId: string,
    fileId: string,
    range?: { start: number; end?: number } | string,
  ): Promise<File> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return storageService.get(shareId, fileId, range);
  }

  async remove(shareId: string, fileId: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return storageService.remove(shareId, fileId);
  }

  async deleteAllFiles(shareId: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { id: true, storageProvider: true },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return storageService.deleteAllFiles(shareId);
  }

  async getZip(shareId: string): Promise<Readable> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    const storageService = this.getStorageService(share?.storageProvider);
    return await storageService.getZip(shareId);
  }

  async notifyRecipientDownload(
    shareId: string,
    fileName: string,
    recipientId?: string,
  ) {
    try {
      if (
        !recipientId ||
        !this.configService.get("smtp.enabled") ||
        !this.configService.get("share.enableShareEmailRecipients") ||
        !this.configService.get("share.enableShareDownloadNotifications")
      )
        return;

      const notificationKey = `share-download-notification:${shareId}:${recipientId}`;
      if (await this.cache.get<true>(notificationKey)) return;

      const share = await this.prisma.share.findUnique({
        where: { id: shareId },
        select: {
          id: true,
          creator: {
            select: { email: true, username: true, displayName: true },
          },
          recipients: {
            where: { id: recipientId },
            select: { email: true },
          },
        },
      });

      const recipient = share?.recipients[0];
      if (!share?.creator?.email || !recipient) return;

      const recipientUser = await this.prisma.user.findUnique({
        where: { email: recipient.email },
        select: { displayName: true, username: true },
      });

      await this.cache.set(
        notificationKey,
        true,
        DOWNLOAD_NOTIFICATION_COOLDOWN_MS,
      );

      await this.emailService.sendShareDownloadNotification(
        share.creator.email,
        share.id,
        fileName,
        recipient.email,
        share.creator?.displayName || share.creator?.username,
        recipientUser?.displayName || recipientUser?.username,
      );
    } catch (e) {
      this.logger.error(
        `Failed to notify recipient download for share ${shareId}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  /**
   * Streams a file (or redirects to S3) and sets all response headers.
   * Used by both the file id route and the direct file URL.
   */
  async serve(
    req: Request,
    res: Response,
    shareId: string,
    fileId: string,
    isDownload: boolean,
    recipientId?: string,
  ): Promise<StreamableFile | undefined> {
    const isHead = req.method === "HEAD";
    const isFullDownload = isDownload && !req.headers.range;
    const isOneTime = await this.isOneTimeShare(shareId);

    if (isOneTime) {
      // Previews and partial requests would allow viewing the file as often
      // as wanted, so only the actual download is possible
      if (!isDownload || req.headers.range) {
        throw new ForbiddenException(
          this.i18n.t("file.oneTimeNoPreview"),
          "one_time_no_preview",
        );
      }
      if (!isHead) await this.claimOneTimeDownload(shareId);
      res.set("Cache-Control", "no-store");
    }

    const storageProvider = await this.getStorageProvider(shareId);

    if (storageProvider === "S3") {
      const url = await this.getPreSignedDownloadUrl(
        shareId,
        fileId,
        isDownload,
      );
      const fileName = await this.getFileName(shareId, fileId);
      if (isDownload && !isHead) {
        void this.notifyRecipientDownload(shareId, fileName, recipientId);
        void this.webhookService.notifyDownload(shareId, fileName);
      }
      if (isOneTime && !isHead) {
        this.removeShareLater(shareId, S3_ONE_TIME_DELETE_DELAY_MS);
      }
      res.status(302).setHeader("Location", url);
      return;
    }

    const file = await this.get(shareId, fileId, req.headers.range);
    const totalSize = parseInt(file.metaData.size, 10);

    if (file.isRangeNotSatisfiable) {
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
      res.set({
        "Content-Range": `bytes */${totalSize}`,
        "Accept-Ranges": "bytes",
      });
      return;
    }

    const mimeType = getMimeType(file.metaData.name);

    // File content never changes for a given id, so it can be revalidated
    // cheaply. The request still passes all security guards every time.
    const etag = `"${file.metaData.id}-${file.metaData.size}"`;
    if (
      !isOneTime &&
      !req.headers.range &&
      req.headers["if-none-match"] === etag
    ) {
      file.file?.destroy();
      res.status(HttpStatus.NOT_MODIFIED);
      res.set({ ETag: etag, "Cache-Control": "private, no-cache" });
      return;
    }

    const headers: Record<string, string | number> = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": contentDisposition(
        file.metaData.name,
        isDownload ? undefined : { type: "inline" },
      ),
    };

    if (!isOneTime) {
      headers["ETag"] = etag;
      headers["Cache-Control"] = "private, no-cache";
    }

    if (file.range) {
      res.status(HttpStatus.PARTIAL_CONTENT);
      headers["Content-Range"] =
        `bytes ${file.range.start}-${file.range.end}/${totalSize}`;
      headers["Content-Length"] = file.range.end - file.range.start + 1;
    } else {
      headers["Content-Length"] = totalSize;
    }

    if (!isPassiveMedia(mimeType)) {
      headers["Content-Security-Policy"] = "sandbox";
    }

    res.set(headers);

    if (isFullDownload && !isHead) {
      void this.notifyRecipientDownload(
        shareId,
        file.metaData.name,
        recipientId,
      );
      void this.webhookService.notifyDownload(shareId, file.metaData.name);
    }

    if (isOneTime && !isHead) {
      res.once("close", () => void this.removeShare(shareId));
    }

    return new StreamableFile(file.file);
  }

  async serveZip(
    req: Request,
    res: Response,
    shareId: string,
    recipientId?: string,
  ): Promise<StreamableFile> {
    const isHead = req.method === "HEAD";
    const isOneTime = await this.isOneTimeShare(shareId);

    if (isOneTime) {
      if (!isHead) await this.claimOneTimeDownload(shareId);
      res.set("Cache-Control", "no-store");
    }

    const zipStream = await this.getZip(shareId);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${shareId}.zip`),
    });

    if (!isHead) {
      void this.notifyRecipientDownload(shareId, `${shareId}.zip`, recipientId);
      void this.webhookService.notifyDownload(shareId, `${shareId}.zip`);
    }

    if (isOneTime && !isHead) {
      res.once("close", () => void this.removeShare(shareId));
    }

    return new StreamableFile(zipStream);
  }

  /** Finds a file of a share by its name, used by the direct file URL */
  async findFileByName(shareId: string, fileName?: string) {
    if (fileName === undefined) {
      // /d/:shareId only works if there is nothing to choose from
      const files = await this.prisma.file.findMany({
        where: { shareId },
        take: 2,
      });
      if (files.length !== 1) {
        throw new NotFoundException(this.i18n.t("file.notFound"));
      }
      return files[0];
    }

    const file = await this.prisma.file.findFirst({
      where: { shareId, name: fileName },
      orderBy: { createdAt: "asc" },
    });
    if (!file) throw new NotFoundException(this.i18n.t("file.notFound"));
    return file;
  }

  async isOneTimeShare(shareId: string): Promise<boolean> {
    const security = await this.prisma.shareSecurity.findUnique({
      where: { shareId },
      select: { oneTimeDownload: true },
    });
    return !!security?.oneTimeDownload;
  }

  /**
   * Atomically marks a one-time share as consumed by expiring it, so that of
   * several simultaneous requests only the first one gets the file.
   */
  private async claimOneTimeDownload(shareId: string) {
    const result = await this.prisma.share.updateMany({
      where: {
        id: shareId,
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: moment(0).toDate() } },
        ],
      },
      data: { expiration: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t("share.notFound"));
    }
  }

  private async removeShare(shareId: string) {
    try {
      await this.deleteAllFiles(shareId);
      await this.prisma.share.delete({ where: { id: shareId } });
    } catch (e) {
      // The expired share is also picked up by the cleanup job
      this.logger.error(
        `Failed to delete one-time share ${shareId}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  private removeShareLater(shareId: string, delayMs: number) {
    setTimeout(() => void this.removeShare(shareId), delayMs).unref();
  }

  async getStorageProvider(shareId: string): Promise<string> {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      select: { storageProvider: true },
    });
    return share?.storageProvider || "LOCAL";
  }

  async getFileName(shareId: string, fileId: string): Promise<string> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, shareId },
      select: { name: true },
    });
    if (!file) throw new NotFoundException(this.i18n.t("file.notFound"));
    return file.name;
  }

  private async streamToUint8Array(stream: Readable): Promise<Uint8Array> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      stream.on("error", reject);
    });
  }
}

export interface File {
  metaData: {
    id: string;
    size: string;
    createdAt: Date;
    mimeType: string | false;
    name: string;
    shareId: string;
  };
  file?: Readable;
  range?: { start: number; end: number };
  isRangeNotSatisfiable?: boolean;
}
