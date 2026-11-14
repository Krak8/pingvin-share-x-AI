import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import * as crypto from "crypto";
import * as moment from "moment";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { API_TOKEN_PREFIX } from "./apiToken.constants";
import { getRequiredScope } from "./apiTokenScope.util";
import { ApiTokenDTO } from "./dto/apiToken.dto";
import { CreateApiTokenDTO } from "./dto/createApiToken.dto";

// Don't write to the database on every single request
const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ApiTokenService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  static hash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  async list(userId: string) {
    const tokens = await this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return tokens.map((token) => ApiTokenDTO.from(token));
  }

  async create(userId: string, dto: CreateApiTokenDTO) {
    if (!this.config.get("security.enableApiTokens")) {
      throw new ForbiddenException(this.i18n.t("apiToken.disabled"));
    }

    const max = this.config.get("security.maxApiTokensPerUser");
    if (max > 0) {
      const count = await this.prisma.apiToken.count({ where: { userId } });
      if (count >= max) {
        throw new BadRequestException(
          this.i18n.t("apiToken.limitReached", { args: { max } }),
        );
      }
    }

    // 256 bits of randomness, so a fast hash is fine for storage
    const token = `${API_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;

    const created = await this.prisma.apiToken.create({
      data: {
        name: dto.name.trim(),
        tokenHash: ApiTokenService.hash(token),
        prefix: token.slice(0, API_TOKEN_PREFIX.length + 4),
        scopes: dto.scopes.join(","),
        expiresAt: dto.expiresInDays
          ? moment().add(dto.expiresInDays, "days").toDate()
          : null,
        user: { connect: { id: userId } },
      },
    });

    // The plain token is returned exactly once and never stored
    return { ...ApiTokenDTO.from(created), token };
  }

  async revoke(userId: string, id: string) {
    const result = await this.prisma.apiToken.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t("apiToken.notFound"));
    }
  }

  /**
   * Resolves a bearer token to a user for a specific request.
   * Returns null if the token is unknown, expired, revoked, if the feature is
   * disabled or if the token isn't allowed to access the requested endpoint.
   */
  async authenticate(
    rawToken: string,
    method: string,
    originalUrl: string,
  ): Promise<User | null> {
    if (!this.config.get("security.enableApiTokens")) return null;

    const requiredScope = getRequiredScope(method, originalUrl);
    if (!requiredScope) return null;

    const token = await this.prisma.apiToken.findUnique({
      where: { tokenHash: ApiTokenService.hash(rawToken) },
      include: { user: true },
    });

    if (!token) return null;
    if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;
    if (!token.scopes.split(",").includes(requiredScope)) return null;
    if (token.user.isActivated === false) return null;

    if (
      !token.lastUsedAt ||
      Date.now() - token.lastUsedAt.getTime() > LAST_USED_UPDATE_INTERVAL_MS
    ) {
      void this.prisma.apiToken
        .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
    }

    // A leaked token must never be able to act as an administrator
    return { ...token.user, isAdmin: false };
  }
}
