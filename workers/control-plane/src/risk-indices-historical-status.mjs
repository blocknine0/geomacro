/**
 * #1827: Source-free historical Risk Indices continuity from a prior
 * full-B2-readback-verified D1 archive anchor. D1 readback is NOT a fresh
 * B2 restore, nor a new current publisher observation or billable score.
 */
export const RISK_INDICES_HISTORICAL_SCHEMA =
  "geomacro.public-risk-indices-historical-continuity.v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const HASH = /^[0-9a-f]{64}$/u;
const RUN = /^\d{1,20}$/u;
const KEYS = ["geopolitics", "macro", "critical_minerals"];

function strictTime(value, now) {
  if (typeof value !== "string") throw new Error("RISK_INDICES_HISTORICAL_DATE_INVALID");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) ||
      new Date(parsed).toISOString() !== value ||
      parsed > now + 5 * 60_000 ||
      now - parsed > MAX_AGE_MS) {
    throw new Error("RISK_INDICES_HISTORICAL_DATE_INVALID");
  }
  return parsed;
}

export function makeRiskIndicesHistoricalMetadata(anchor, { now = Date.now() } = {}) {
  if (!Number.isFinite(now) || !anchor || typeof anchor !== "object" ||
      Array.isArray(anchor) || !HASH.test(String(anchor.b2_sha256 ?? "")) ||
      !HASH.test(String(anchor.payload_sha256 ?? "")) ||
      !RUN.test(String(anchor.source_run_id ?? "")) ||
      anchor.anchor_kind !== "direct_verified_b2_snapshot") {
    throw new Error("RISK_INDICES_HISTORICAL_ANCHOR_INVALID");
  }
  const generated = strictTime(anchor.generated_at, now);
  const source = strictTime(anchor.snapshot_as_of, now);
  if (source > generated + 5 * 60_000) {
    throw new Error("RISK_INDICES_HISTORICAL_ORIGINAL_TIME_AFTER_ARCHIVE");
  }
  // Never include signed bytes, archive key, source identity, individual risk
  // values, underlying index series or provenance text in a public response.
  return {
    ok: true,
    schema: RISK_INDICES_HISTORICAL_SCHEMA,
    product: "risk-indices",
    historical_only: true,
    current_snapshot_available: false,
    status: "verified_historical_archive_anchor",
    archive_generated_at: anchor.generated_at,
    original_snapshot_as_of: anchor.snapshot_as_of,
    archive_age_minutes: Math.floor(Math.max(0, now - generated) / 60_000),
    prior_verified_domains: [...KEYS],
    independently_verified_archive_at_past_write: true,
    independently_rechecked_b2_now: false,
    hot_freshness_not_asserted: true,
    source_news_freshness_not_asserted: true,
    signed_country_gro_coverage_not_asserted: true,
    source_rights_not_recertified: true,
    commercial_eligible: false,
    x402_chargeable: false,
    usdc_spent: 0,
  };
}
