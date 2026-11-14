import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { User } from "@prisma/client";
import { Request } from "express";
import { Strategy, StrategyOptionsWithRequest } from "passport-jwt";
import { extractApiToken } from "src/apiToken/apiToken.constants";
import { ApiTokenService } from "src/apiToken/apiToken.service";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";

/**
 * The regular passport-jwt strategy that additionally understands API tokens
 * (`Authorization: Bearer pvx_...`). Because this is the strategy behind
 * every JwtGuard, all existing guards support API tokens without changes.
 */
class JwtOrApiTokenStrategy extends Strategy {
  resolveApiToken?: (
    token: string,
    method: string,
    originalUrl: string,
  ) => Promise<User | null>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate(req: Request, options?: any) {
    const apiToken = extractApiToken(req.headers.authorization);

    if (!apiToken || !this.resolveApiToken) {
      return super.authenticate(req, options);
    }

    // success/fail/error are attached to the strategy instance by passport
    // for every authentication attempt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as any;
    this.resolveApiToken(apiToken, req.method, req.originalUrl)
      .then((user) =>
        user ? self.success(user) : self.fail("Invalid API token", 401),
      )
      .catch((error) => self.error(error));
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(JwtOrApiTokenStrategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    apiTokenService: ApiTokenService,
  ) {
    config.get("internal.jwtSecret");
    super({
      jwtFromRequest: JwtStrategy.extractJWT,
      secretOrKey: config.get("internal.jwtSecret"),
    } as StrategyOptionsWithRequest);
    this.resolveApiToken = (token, method, url) =>
      apiTokenService.authenticate(token, method, url);
  }

  private static extractJWT(req: Request) {
    if (!req.cookies.access_token) return null;
    return req.cookies.access_token;
  }

  async validate(payload: {
    sub: string;
    refreshTokenId?: string;
  }): Promise<User | null> {
    if (!payload.refreshTokenId) return null;
    const refreshToken = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.refreshTokenId,
        userId: payload.sub,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    return refreshToken?.user ?? null;
  }
}
