/**
 * Public Risk Indices browser-read policy. This governs client refresh only:
 * it NEVER widens the 60-minute signed-source validity window or bypasses the
 * account-wide Cloudflare D1 read admission governor.
 *
 * 5 min on verified success; 10 min on missing/failing signed GRI; no hidden
 * tab polls. Long user-requested intervals are allowed, short ones clamped.
 */
export const RISK_INDICES_VISIBLE_REFRESH_MS = 5 * 60_000;
export const RISK_INDICES_UNAVAILABLE_REFRESH_MS = 10 * 60_000;
export const RISK_INDICES_REQUEST_TIMEOUT_MS = 8_000;
export const RISK_INDICES_VERIFIED_CACHE_MS = 60_000;
const MAX_USER_REFRESH_MS = 24 * 60 * 60_000;

export function riskIndicesRefreshDelay(
  verifiedAvailable: boolean,
  requestedRefreshMs = RISK_INDICES_VISIBLE_REFRESH_MS,
): number {
  const minimum = verifiedAvailable
    ? RISK_INDICES_VISIBLE_REFRESH_MS
    : RISK_INDICES_UNAVAILABLE_REFRESH_MS;
  if (!Number.isFinite(requestedRefreshMs) || requestedRefreshMs <= 0) return minimum;
  return Math.min(MAX_USER_REFRESH_MS, Math.max(minimum, Math.trunc(requestedRefreshMs)));
}

export function riskIndicesResumeDelay(
  lastStartedAt: number,
  now: number,
  refreshDelayMs: number,
): number {
  if (!Number.isFinite(lastStartedAt) || lastStartedAt <= 0) return 0;
  // A rolled-back or invalid wall-clock must not cause a poll storm.
  if (!Number.isFinite(now) || now < lastStartedAt) return refreshDelayMs;
  return Math.max(0, refreshDelayMs - (now - lastStartedAt));
}
