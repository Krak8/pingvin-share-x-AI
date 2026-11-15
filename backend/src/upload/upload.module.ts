import { Module } from "@nestjs/common";
import { FileModule } from "src/file/file.module";
import { ReverseShareModule } from "src/reverseShare/reverseShare.module";
import { ShareModule } from "src/share/share.module";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";

@Module({
  imports: [ShareModule, FileModule, ReverseShareModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
