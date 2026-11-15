export const API_TOKEN_PREFIX = "pvx_";

export const API_TOKEN_SCOPES = ["upload", "read", "manage"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/**
 * Returns true if the Authorization header carries something that looks like
 * one of our API tokens. Requests with such a header never fall back to
 * anonymous access, so a typo in a token can't silently create an anonymous
 * share.
 */
export function hasApiTokenHeader(authorization?: string | string[]): boolean {
  if (typeof authorization !== "string") return false;
  return /^Bearer\s+pvx_/i.test(authorization);
}

export function extractApiToken(authorization?: string): string | null {
  if (!hasApiTokenHeader(authorization)) return null;
  return authorization!.replace(/^Bearer\s+/i, "").trim();
}
