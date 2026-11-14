import { ApiTokenScope } from "./apiToken.constants";

/**
 * API tokens are intentionally limited. They only work on the endpoints needed
 * to upload, read and manage shares. Everything else (account settings, token
 * management, admin endpoints, config, ...) requires a normal browser session.
 *
 * Returns the scope a token needs for the given request, or null if tokens are
 * not accepted for it at all.
 */
export function getRequiredScope(
  method: string,
  originalUrl: string,
): ApiTokenScope | null {
  const m = method.toUpperCase();
  const path = originalUrl.split("?")[0].replace(/\/+$/, "");
  const isRead = m === "GET" || m === "HEAD";

  // curl friendly upload endpoints
  if (path === "/api/upload" || path.startsWith("/api/upload/")) {
    return m === "POST" || m === "PUT" ? "upload" : null;
  }

  // direct file URLs
  if (path.startsWith("/api/d/")) {
    return isRead ? "read" : null;
  }

  if (path === "/api/shares") {
    if (isRead) return "read";
    if (m === "POST") return "upload";
    return null;
  }

  if (path.startsWith("/api/shares/")) {
    const [first, sub] = path.slice("/api/shares/".length).split("/");

    // "all" lists every share of the instance and is admin only
    if (first === "all") return null;
    if (first === "received" || first === "isShareIdAvailable") {
      return isRead ? "read" : null;
    }

    if (isRead) return "read";

    if (m === "POST") {
      if (sub === "files" || sub === "complete") return "upload";
      if (sub === "token") return "read";
      if (sub === "expire") return "manage";
      return null;
    }

    if (m === "DELETE") {
      if (sub === "complete") return "upload";
      // the share itself or one of its files
      if (sub === undefined || sub === "files") return "manage";
      return null;
    }

    if (m === "PATCH" && sub === undefined) return "manage";
  }

  return null;
}
