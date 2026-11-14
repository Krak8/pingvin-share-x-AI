import { Global, Module } from "@nestjs/common";
import { ApiTokenController } from "./apiToken.controller";
import { ApiTokenService } from "./apiToken.service";

@Global()
@Module({
  controllers: [ApiTokenController],
  providers: [ApiTokenService],
  exports: [ApiTokenService],
})
export class ApiTokenModule {}
