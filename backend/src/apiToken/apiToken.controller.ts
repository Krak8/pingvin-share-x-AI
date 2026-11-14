import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AuthenticatedGuard } from "src/auth/guard/authenticated.guard";
import { ApiTokenService } from "./apiToken.service";
import { CreateApiTokenDTO } from "./dto/createApiToken.dto";

// Managing tokens requires a normal browser session. API tokens themselves are
// never accepted here (see getRequiredScope).
@Controller("apiTokens")
@UseGuards(AuthenticatedGuard)
export class ApiTokenController {
  constructor(private apiTokenService: ApiTokenService) {}

  @Get()
  async list(@GetUser() user: User) {
    return this.apiTokenService.list(user.id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async create(@GetUser() user: User, @Body() body: CreateApiTokenDTO) {
    return this.apiTokenService.create(user.id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async revoke(@GetUser() user: User, @Param("id") id: string) {
    await this.apiTokenService.revoke(user.id, id);
  }
}
