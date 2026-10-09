/**
 * Validate original canonical Global Risk snapshot time before consuming any B2
 * quota. Revalidating or re-uploading a previous day's history cannot turn it
 * into a 90-minute-fresh public D1 snapshot.
 *
 * This is intentionally independent of archive/history retention: the last
 * verified B2 historical snapshot is preserved by not writing anything.
 */
export const GLOBAL_RISK_HOT_SOURCE_MAX_AGE_MS = 90 * 60 * 1000;
export const GLOBAL_RISK_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function assertCurrentGlobalRiskSourceForHotPublish(sourceAsOf, now = Date.now()) {
  const sourceMs = Date.parse(String(sourceAsOf ?? ""));
  if (!Number.isFinite(sourceMs) || !Number.isFinite(now)) {
    throw new Error("GLOBAL_RISK_SOURCE_AS_OF_INVALID");
  }
  if (sourceMs > now + GLOBAL_RISK_MAX_FUTURE_SKEW_MS) {
    throw new Error("GLOBAL_RISK_SOURCE_AS_OF_IN_FUTURE");
  }
  if (now - sourceMs > GLOBAL_RISK_HOT_SOURCE_MAX_AGE_MS) {
    throw new Error("GLOBAL_RISK_SOURCE_STALE_FOR_D1_HOT_PUBLISH");
  }
  return { source_as_of: new Date(sourceMs).toISOString(), eligible_for_hot_publication: true };
}
