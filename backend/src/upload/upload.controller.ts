import {
  Controller,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { UploadGuard } from "./upload.guard";
import { UploadService } from "./upload.service";

type UploadResult = Awaited<ReturnType<UploadService["createShare"]>>;

/**
 * curl friendly upload endpoints. Both create a share and return its link.
 *
 *   curl -H "Authorization: Bearer $TOKEN" -F file=@a.zip https://host/api/upload
 *   curl -H "Authorization: Bearer $TOKEN" -T a.zip https://host/api/upload/a.zip
 *
 * Options (form fields for POST, query parameters for PUT): expires, password,
 * maxViews, name, description, id, oneTime, noEmbed.
 * `?format=text` returns just the share link, `?format=direct` the direct link.
 */
@Controller("upload")
@UseGuards(UploadGuard)
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  async upload(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @GetUser() user?: User,
    @Query("format") format?: string,
  ) {
    const reverseShareToken = req.cookies?.reverse_share_token;
    const maxBytes = await this.uploadService.getMaxBytes(
      user,
      reverseShareToken,
    );

    const { files, fields } = await this.uploadService.receiveMultipart(
      req,
      res,
      maxBytes,
    );

    try {
      const result = await this.uploadService.createShare(
        user,
        reverseShareToken,
        fields,
        files,
      );
      return this.format(res, result, format);
    } finally {
      await this.uploadService.removeTempFiles(files.map((f) => f.path));
    }
  }

  @Put(":fileName")
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  async uploadRaw(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("fileName") fileName: string,
    @Query() query: Record<string, unknown>,
    @GetUser() user?: User,
  ) {
    const reverseShareToken = req.cookies?.reverse_share_token;
    const maxBytes = await this.uploadService.getMaxBytes(
      user,
      reverseShareToken,
    );

    const file = await this.uploadService.receiveRawBody(
      req,
      fileName,
      maxBytes,
    );

    // Passwords are better sent as a header than in the URL
    const options = { ...query };
    const passwordHeader = req.headers["x-share-password"];
    if (typeof passwordHeader === "string" && passwordHeader) {
      options.password = passwordHeader;
    }

    try {
      const result = await this.uploadService.createShare(
        user,
        reverseShareToken,
        options,
        [file],
      );
      return this.format(res, result, query.format as string | undefined);
    } finally {
      await this.uploadService.removeTempFiles([file.path]);
    }
  }

  private format(res: Response, result: UploadResult, format?: string) {
    if (format === "text" || format === "direct") {
      res.type("text/plain");
      return `${format === "direct" ? (result.directUrl ?? result.url) : result.url}\n`;
    }
    return result;
  }
}
