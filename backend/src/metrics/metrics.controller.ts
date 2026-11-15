import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import * as crypto from "crypto";
import { Response } from "express";
import { ConfigService } from "src/config/config.service";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
@SkipThrottle()
export class MetricsController {
  constructor(
    private metricsService: MetricsService,
    private config: ConfigService,
  ) {}

  @Get()
  async getMetrics(
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string = this.config.get("integrations.metricsToken");

    // Disabled, or enabled without a token (which would expose it to anyone)
    if (!this.config.get("integrations.metricsEnabled") || !token) {
      throw new NotFoundException();
    }

    const provided = authorization?.replace(/^Bearer\s+/i, "") ?? "";
    const a = crypto.createHash("sha256").update(provided).digest();
    const b = crypto.createHash("sha256").update(token).digest();
    if (!crypto.timingSafeEqual(a, b)) throw new UnauthorizedException();

    res.type("text/plain; version=0.0.4; charset=utf-8");
    return this.metricsService.render(
      process.env.npm_package_version ?? "unknown",
    );
  }
}
