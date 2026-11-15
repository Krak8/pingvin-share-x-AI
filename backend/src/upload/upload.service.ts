import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import { I18nService } from "nestjs-i18n";
import * as multer from "multer";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { ConfigService } from "src/config/config.service";
import { FileService } from "src/file/file.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { CreateShareDTO } from "src/share/dto/createShare.dto";
import { ShareSecurityDTO } from "src/share/dto/shareSecurity.dto";
import { ShareService } from "src/share/share.service";
import { DATA_DIRECTORY } from "../constants";
import { LimitedDiskStorage } from "./limitedDiskStorage";
import {
  makeUniqueName,
  parseUploadOptions,
  sanitizeFileName,
  UploadOptions,
} from "./uploadOptions.util";

const TEMP_DIRECTORY = `${DATA_DIRECTORY}/uploads/_temp`;
const MAX_FILES_PER_UPLOAD = 100;

export type IncomingFile = { path: string; name: string; size: number };

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private config: ConfigService,
    private shareService: ShareService,
    private fileService: FileService,
    private reverseShareService: ReverseShareService,
    private readonly i18n: I18nService,
  ) {}

  /** The same limit the regular upload enforces for this uploader */
  async getMaxBytes(user?: User, reverseShareToken?: string): Promise<number> {
    if (
      reverseShareToken &&
      (await this.reverseShareService.isValid(reverseShareToken))
    ) {
      const reverseShare =
        await this.reverseShareService.getByToken(reverseShareToken);
      if (reverseShare?.maxShareSize) {
        return parseInt(reverseShare.maxShareSize);
      }
    } else if (user?.shareSizeLimit) {
      return parseInt(user.shareSizeLimit);
    }
    return parseInt(this.config.get("share.maxSize"));
  }

  /** Parses a multipart/form-data request into temporary files and fields */
  async receiveMultipart(
    req: Request,
    res: Response,
    maxBytes: number,
  ): Promise<{ files: IncomingFile[]; fields: Record<string, unknown> }> {
    await fs.promises.mkdir(TEMP_DIRECTORY, { recursive: true });

    if (!req.is("multipart/form-data")) {
      throw new BadRequestException(
        "Send the file as multipart/form-data, e.g. curl -F file=@file.zip",
      );
    }

    const parser = multer({
      storage: new LimitedDiskStorage(TEMP_DIRECTORY, maxBytes),
      limits: {
        files: MAX_FILES_PER_UPLOAD,
        fields: 30,
        fieldSize: 16 * 1024,
        parts: MAX_FILES_PER_UPLOAD + 30,
      },
      // Without this multer would decode file names as latin1
      defParamCharset: "utf8",
    } as multer.Options).any();

    try {
      await new Promise<void>((resolve, reject) =>
        parser(req, res, (error?: unknown) =>
          error ? reject(error) : resolve(),
        ),
      );
    } catch (error) {
      await this.removeTempFiles(
        ((req as Request & { files?: Express.Multer.File[] }).files ?? []).map(
          (f) => f.path,
        ),
      );
      throw this.translateMulterError(error);
    }

    const files = ((req as Request & { files?: Express.Multer.File[] }).files ??
      []) as Express.Multer.File[];

    const incoming: IncomingFile[] = [];
    const taken = new Set<string>();
    for (const file of files) {
      const name = sanitizeFileName(file.originalname);
      if (!name) {
        await this.removeTempFiles(files.map((f) => f.path));
        throw new BadRequestException(this.i18n.t("file.invalidFileName"));
      }
      const uniqueName = makeUniqueName(name, taken);
      taken.add(uniqueName);
      incoming.push({ path: file.path, name: uniqueName, size: file.size });
    }

    return {
      files: incoming,
      fields: (req.body ?? {}) as Record<string, unknown>,
    };
  }

  /** Streams the raw request body (curl --upload-file) into a temporary file */
  async receiveRawBody(
    req: Request,
    rawFileName: string,
    maxBytes: number,
  ): Promise<IncomingFile> {
    const name = sanitizeFileName(rawFileName);
    if (!name)
      throw new BadRequestException(this.i18n.t("file.invalidFileName"));

    const declared = parseInt(req.headers["content-length"] ?? "");
    if (!isNaN(declared) && declared > maxBytes) {
      throw new PayloadTooLargeException(this.i18n.t("file.maxSizeExceeded"));
    }

    await fs.promises.mkdir(TEMP_DIRECTORY, { recursive: true });
    const path = `${TEMP_DIRECTORY}/${crypto.randomUUID()}`;
    let size = 0;

    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > maxBytes) return callback(new PayloadTooLargeException());
        callback(null, chunk);
      },
    });

    try {
      await pipeline(req, counter, fs.createWriteStream(path));
    } catch (error) {
      await this.removeTempFiles([path]);
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(this.i18n.t("file.uploadAborted"));
    }

    return { path, name, size };
  }

  /**
   * Creates a share from the received files through the same code paths the
   * web UI uses, so size limits, quotas, ClamAV, storage providers (local/S3),
   * reverse shares etc. all apply.
   */
  async createShare(
    user: User | undefined,
    reverseShareToken: string | undefined,
    rawOptions: Record<string, unknown>,
    files: IncomingFile[],
  ) {
    if (files.length === 0) {
      throw new BadRequestException(this.i18n.t("file.noFileUploaded"));
    }

    const options = parseUploadOptions(rawOptions, {
      expiration: this.config.get("share.defaultExpiration"),
      idLength: this.config.get("share.shareIdLength"),
    });

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxBytes = await this.getMaxBytes(user, reverseShareToken);
    if (totalSize > maxBytes) {
      throw new PayloadTooLargeException(this.i18n.t("file.maxSizeExceeded"));
    }

    const share = await this.shareService.create(
      this.toCreateShareDTO(options, totalSize),
      user,
      reverseShareToken,
    );

    try {
      for (const file of files) {
        await this.storeFile(share.id, file);
      }
      await this.shareService.complete(share.id, reverseShareToken);
    } catch (error) {
      await this.shareService
        .remove(share.id, true)
        .catch((e) =>
          this.logger.error(`Failed to clean up share ${share.id}`, e),
        );
      throw error;
    }

    return this.buildResult(share.id);
  }

  private toCreateShareDTO(
    options: UploadOptions,
    size: number,
  ): CreateShareDTO {
    const security: Partial<ShareSecurityDTO> = {};
    if (options.password) security.password = options.password;
    if (options.maxViews) security.maxViews = options.maxViews;
    if (options.oneTimeDownload) security.oneTimeDownload = true;
    if (options.embedsDisabled) security.embedsDisabled = true;

    return {
      id: options.id,
      name: options.name,
      description: options.description,
      expiration: options.expiration,
      recipients: [],
      security,
      size,
    } as CreateShareDTO;
  }

  /**
   * Hands a temporary file to the file service in chunks. The file service
   * expects chunks of exactly "chunkSize" bytes (except the last one).
   */
  private async storeFile(shareId: string, file: IncomingFile) {
    const chunkSize: number = this.config.get("share.chunkSize");
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    // The file service assigns an id on the first chunk
    const target: { id?: string; name: string } = { name: file.name };

    const handle = await fs.promises.open(file.path, "r");
    try {
      for (let index = 0; index < totalChunks; index++) {
        const position = index * chunkSize;
        const length = Math.min(chunkSize, file.size - position);
        const buffer = Buffer.alloc(length);

        let read = 0;
        while (read < length) {
          const { bytesRead } = await handle.read(
            buffer,
            read,
            length - read,
            position + read,
          );
          if (bytesRead === 0) break;
          read += bytesRead;
        }

        await this.fileService.create(
          buffer.toString("base64"),
          { index, total: totalChunks },
          target,
          shareId,
        );
      }
    } finally {
      await handle.close();
    }
  }

  private async buildResult(shareId: string) {
    const share = await this.shareService.get(shareId);
    const appUrl: string = this.config.get("general.appUrl");

    const files = share.files.map(
      (file: { id: string; name: string; size: string }) => ({
        id: file.id,
        name: file.name,
        size: parseInt(file.size),
        url: `${appUrl}/api/d/${share.id}/${encodeURIComponent(file.name)}`,
      }),
    );

    return {
      id: share.id,
      url: `${appUrl}/share/${share.id}`,
      directUrl: files.length === 1 ? files[0].url : null,
      expiresAt:
        new Date(share.expiration).getTime() === 0 ? null : share.expiration,
      passwordProtected: share.hasPassword,
      oneTimeDownload: share.oneTimeDownload,
      files,
    };
  }

  async removeTempFiles(paths: string[]) {
    await Promise.all(
      paths.map((path) =>
        fs.promises.rm(path, { force: true }).catch(() => {}),
      ),
    );
  }

  private translateMulterError(error: unknown): unknown {
    if (error instanceof HttpException) return error;

    const code = (error as { code?: string })?.code;
    if (code === "LIMIT_FILE_SIZE" || code === "LIMIT_FILE_COUNT") {
      return new HttpException(
        code === "LIMIT_FILE_COUNT"
          ? `At most ${MAX_FILES_PER_UPLOAD} files per upload`
          : this.i18n.t("file.maxSizeExceeded"),
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    if (typeof code === "string" && code.startsWith("LIMIT_")) {
      return new BadRequestException((error as Error).message);
    }
    // e.g. the client aborted the connection or sent a broken body
    return new BadRequestException(this.i18n.t("file.uploadAborted"));
  }
}
