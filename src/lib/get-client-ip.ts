import { NextRequest } from "next/server";

/**
 * Best-effort client IP extraction from a Next.js or standard Request.
 * Honors X-Forwarded-For (first hop), then X-Real-IP, then "unknown".
 * Used for IP-based rate limiting where user identity isn't known yet.
 */
export function getClientIp(req: NextRequest | Request): string {
  const headers = "headers" in req ? req.headers : new Headers();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
