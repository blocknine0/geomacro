/**
 * Best-effort per-IP burst protection for the public Ask Geomacro surface.
 *
 * This intentionally does not claim durable distributed rate limiting. A
 * database-backed quota is a later production gate; this limiter prevents a
 * single warm runtime from accepting an unbounded burst in the meantime.
 */
const RATE_BUCKET = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export function checkAskRateLimit(ip: string) {
  const now = Date.now();
  const entry = RATE_BUCKET.get(ip);

  if (!entry || entry.reset < now) {
    RATE_BUCKET.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= RATE_LIMIT;
}
