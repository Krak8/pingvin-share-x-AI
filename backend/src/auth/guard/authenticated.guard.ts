import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Requires a signed in user. In contrast to JwtGuard this never falls back to
 * anonymous access when "allowUnauthenticatedShares" is enabled and responds
 * with a 401 if there is no valid session.
 */
@Injectable()
export class AuthenticatedGuard extends AuthGuard("jwt") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    return !!context.switchToHttp().getRequest().user;
  }
}
