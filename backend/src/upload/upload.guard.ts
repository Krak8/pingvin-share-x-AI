import { ExecutionContext, Injectable } from "@nestjs/common";
import { CreateShareGuard } from "src/share/guard/createShare.guard";

/**
 * Same access rules as creating a share in the web UI (signed in user, API
 * token, reverse share link or anonymous if the admin allows it). Reverse
 * share links can be used by non-browser clients through the
 * `X-Reverse-Share-Token` header instead of the cookie.
 */
@Injectable()
export class UploadGuard extends CreateShareGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers["x-reverse-share-token"];

    if (typeof header === "string" && header.length > 0) {
      request.cookies = { ...request.cookies, reverse_share_token: header };
    }

    return super.canActivate(context);
  }
}
