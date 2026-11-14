import { PayloadTooLargeException } from "@nestjs/common";
import { Request } from "express";
import * as fs from "fs";
import * as crypto from "crypto";
import { join } from "path";
import * as multer from "multer";

export type TempFile = Express.Multer.File;

/**
 * A multer storage engine that writes uploads to disk like multer's own
 * diskStorage, but additionally stops as soon as all files of a request
 * together exceed a limit. Without this, an upload of many large files could
 * fill the disk before the share size limit is ever checked.
 */
export class LimitedDiskStorage implements multer.StorageEngine {
  constructor(
    private directory: string,
    private maxTotalBytes: number,
  ) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    cb: (error?: unknown, info?: Partial<Express.Multer.File>) => void,
  ) {
    const path = join(this.directory, crypto.randomUUID());
    const out = fs.createWriteStream(path);
    const state = req as Request & { uploadedBytes?: number };
    let size = 0;
    let failed = false;

    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      file.stream.unpipe(out);
      out.destroy();
      fs.unlink(path, () => cb(error));
    };

    file.stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      state.uploadedBytes = (state.uploadedBytes ?? 0) + chunk.length;
      if (state.uploadedBytes > this.maxTotalBytes) {
        fail(new PayloadTooLargeException());
      }
    });
    file.stream.on("error", fail);
    out.on("error", fail);
    out.on("finish", () => {
      if (!failed) cb(null, { path, size, destination: this.directory });
    });
    file.stream.pipe(out);
  }

  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null) => void,
  ) {
    fs.unlink(file.path, () => cb(null));
  }
}
