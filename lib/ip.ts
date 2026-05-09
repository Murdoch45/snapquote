/**
 * Get the trustworthy client IP from a request.
 *
 * On Vercel the edge sets `x-real-ip` to the actual remote address after
 * stripping/normalizing `x-forwarded-for`. Reading `x-forwarded-for`
 * directly is unsafe because callers can spoof that header, defeating
 * IP-based rate limits. (Audit 8 M7.)
 *
 * We prefer `x-real-ip`, fall back to the first hop in `x-forwarded-for`
 * for environments that don't set `x-real-ip` (local dev, non-Vercel
 * hosting), and finally return "unknown" so callers always get a string.
 *
 * Convention: any code that needs the client IP — for rate limiting,
 * audit-log writes, abuse signals — MUST go through this helper. Don't
 * read `x-forwarded-for` directly.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.length > 0) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}
