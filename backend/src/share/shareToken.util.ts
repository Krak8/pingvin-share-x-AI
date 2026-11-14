import { Request } from "express";

/**
 * The share token (issued by POST /shares/:id/token) normally travels as a
 * cookie. Non-browser clients like curl can send it as `X-Share-Token` header
 * instead, which avoids needing a cookie jar for password protected shares.
 */
export function getShareTokenFromRequest(
  request: Request,
  shareId: string,
): string | undefined {
  const cookie = request.cookies?.[`share_${shareId}_token`];
  if (cookie) return cookie;

  const header = request.headers["x-share-token"];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}
