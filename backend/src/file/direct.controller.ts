import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { FileService, getMimeType, isPassiveMedia } from "./file.service";
import { getValidRecipientId } from "./file.controller";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";

/**
 * Direct file URLs: /api/d/:shareId/:filename
 *
 * Serves the raw file without any page or JavaScript in between, so the URL
 * can be used with curl/wget, embedded in Markdown or posted to Discord.
 * Media is shown inline by default, everything else is downloaded. Append
 * `?download=1` to force a download.
 */
@Controller("d")
export class DirectController {
  constructor(private fileService: FileService) {}

  @Throttle({ default: { limit: 1200, ttl: 60 * 1000 } })
  @Get(":shareId")
  @UseGuards(IdValidation, FileSecurityGuard)
  async getSingleFile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Query("download") download?: string,
    @Query("recipient") recipientId?: string,
  ) {
    const file = await this.fileService.findFileByName(shareId);
    return this.serve(req, res, shareId, file, download, recipientId);
  }

  @Throttle({ default: { limit: 1200, ttl: 60 * 1000 } })
  @Get(":shareId/:fileName")
  @UseGuards(IdValidation, FileSecurityGuard)
  async getFileByName(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileName") fileName: string,
    @Query("download") download?: string,
    @Query("recipient") recipientId?: string,
  ) {
    const file = await this.fileService.findFileByName(shareId, fileName);
    return this.serve(req, res, shareId, file, download, recipientId);
  }

  private async serve(
    req: Request,
    res: Response,
    shareId: string,
    file: { id: string; name: string },
    download: string | undefined,
    recipientId: string | undefined,
  ) {
    const forceDownload = download === "1" || download === "true";
    const forceInline = download === "0" || download === "false";

    // Without an explicit choice, media is shown inline and everything else is
    // downloaded. One-time shares are always downloaded by default, because a
    // preview must never use up the link. An explicit ?download=0 on a
    // one-time share is refused by FileService.serve().
    const isDownload =
      forceDownload ||
      (!forceInline &&
        ((await this.fileService.isOneTimeShare(shareId)) ||
          !isPassiveMedia(getMimeType(file.name))));

    return this.fileService.serve(
      req,
      res,
      shareId,
      file.id,
      isDownload,
      getValidRecipientId(recipientId),
    );
  }
}
