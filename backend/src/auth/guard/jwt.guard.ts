import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { hasApiTokenHeader } from "src/apiToken/apiToken.constants";
import { ConfigService } from "src/config/config.service";

@Injectable()
export class JwtGuard extends AuthGuard("jwt") {
  constructor(private config: ConfigService) {
    super();
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch (error) {
      // A client that sends an API token wants to be authenticated. Falling
      // back to anonymous access would silently attribute e.g. an upload to
      // nobody, so a bad token is rejected instead.
      const request = context.switchToHttp().getRequest();
      if (hasApiTokenHeader(request.headers?.authorization)) throw error;

      return this.config.get("security.allowUnauthenticatedShares");
    }
  }
}
