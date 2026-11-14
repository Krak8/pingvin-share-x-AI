import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { CreateShareGuard } from "src/share/guard/createShare.guard";
import { StrictShareOwnerGuard } from "src/share/guard/strictShareOwner.guard";
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { FileService } from "./file.service";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";

export const VALID_ID_REGEX = /^[a-zA-Z0-9-]*={0,2}$/;

export function getValidRecipientId(recipientId?: string): string | undefined {
  if (!recipientId) return undefined;
  return VALID_ID_REGEX.test(recipientId) ? recipientId : undefined;
}

@Controller("shares/:shareId/files")
export class FileController {
  constructor(private fileService: FileService) {}

  @Post("upload-init")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async uploadInit(
    @Body()
    body: {
      id?: string;
      name: string;
      totalChunks: number;
    },
    @Param("shareId") shareId: string,
  ) {
    return await this.fileService.createPreSignedUploadUrls(
      shareId,
      body.name,
      body.totalChunks,
    );
  }

  @Post("upload-complete")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async uploadComplete(
    @Body()
    body: {
      id?: string;
      name: string;
      uploadId: string;
      parts: Array<{ ETag: string; PartNumber: number }>;
    },
    @Param("shareId") shareId: string,
  ) {
    return await this.fileService.completePreSignedUpload(
      shareId,
      body.id,
      body.name,
      body.uploadId,
      body.parts,
    );
  }

  @Post("upload-abort")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async uploadAbort(
    @Body()
    body: {
      name: string;
      uploadId: string;
    },
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.abortPreSignedUpload(
      shareId,
      body.name,
      body.uploadId,
    );
  }

  @Post()
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async create(
    @Query()
    query: {
      id: string;
      name: string;
      chunkIndex: string;
      totalChunks: string;
    },
    @Body() body: string,
    @Param("shareId") shareId: string,
  ) {
    const { id, name, chunkIndex, totalChunks } = query;

    // Data can be empty if the file is empty
    return await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
    );
  }

  @Get("zip")
  @UseGuards(FileSecurityGuard)
  async getZip(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Query("recipient") recipientId?: string,
  ) {
    return this.fileService.serveZip(
      req,
      res,
      shareId,
      getValidRecipientId(recipientId),
    );
  }

  @Throttle({
    default: {
      limit: 1200,
      ttl: 60 * 1000,
    },
  })
  @Get(":fileId")
  @UseGuards(FileSecurityGuard)
  async getFile(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
    @Query("download") download = "true",
    @Query("recipient") recipientId?: string,
  ) {
    return this.fileService.serve(
      req,
      res,
      shareId,
      fileId,
      download === "true",
      getValidRecipientId(recipientId),
    );
  }

  @Delete(":fileId")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async remove(
    @Param("fileId") fileId: string,
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.remove(shareId, fileId);
  }
}
