/**
 * #1827: Non-current, source-free provenance for a previously B2-readback-
 * verified GRI snapshot already anchored in D1.
 *
 * Checking an existing D1 SHA-256-bound anchor is NOT checking B2 again.
 * Do not offer paid/current intelligence or relabel a historical publisher
 * timestamp as a newly published event.
 */
export const GRI_HISTORICAL_METADATA_SCHEMA =
  "geomacro.public-global-risk-historical-continuity.v1";
export const GRI_HISTORICAL_MAX_AGE_MS=30*24*60*60*1000;
export const GRI_HOT_MAX_AGE_MS=90*60*1000;
const HASH=/^[a-f0-9]{64}$/u;
const RUN=/^\d{1,20}$/u;
const allowedKind=new Set(["direct_verified_b2_snapshot","prior_b2_baseline_of_independent_gri_proof"]);
function assert(ok,code){if(!ok)throw new Error(code);}
function strictTime(value, now) {
  const parsed=Date.parse(String(value??""));
  assert(Number.isFinite(parsed)&&new Date(parsed).toISOString()===value&&
    parsed<=now+5*60_000&&now-parsed<=GRI_HISTORICAL_MAX_AGE_MS,
    "GLOBAL_RISK_HISTORICAL_TIMESTAMP_INVALID");
  return parsed;
}
export function makeGriHistoricalContinuityMetadata(anchor,{now=Date.now()}={}) {
  assert(Number.isFinite(now)&&anchor&&typeof anchor==="object"&&!Array.isArray(anchor),
    "GLOBAL_RISK_HISTORICAL_ANCHOR_INVALID");
  assert(HASH.test(String(anchor.b2_sha256??"")) &&
    HASH.test(String(anchor.payload_sha256??"")) &&
    RUN.test(String(anchor.source_run_id??"")) &&
    allowedKind.has(anchor.anchor_kind),
    "GLOBAL_RISK_HISTORICAL_ANCHOR_INVALID");
  const baselineMs=strictTime(anchor.generated_at,now);
  let asOf=null;
  if(anchor.anchor_kind==="direct_verified_b2_snapshot") {
    const sourceMs=strictTime(anchor.snapshot_as_of,now);
    assert(sourceMs<=baselineMs+5*60_000,
      "GLOBAL_RISK_HISTORICAL_SOURCE_FUTURE");
    asOf=anchor.snapshot_as_of;
  } else {
    assert(anchor.snapshot_as_of===null,
      "GLOBAL_RISK_HISTORICAL_BASELINE_SOURCE_UNPROVEN");
  }
  // This is the durable archived-object generation time, never a claim that
  // original news occurred then or that a fresh object was re-read today.
  return {
    ok:true,
    schema:GRI_HISTORICAL_METADATA_SCHEMA,
    product:"global-risk",
    historical_only:true,
    current_snapshot_available:false,
    status:"verified_historical_archive_anchor",
    archive_generated_at:anchor.generated_at,
    original_snapshot_as_of:asOf,
    anchor_kind:anchor.anchor_kind,
    archive_age_minutes:Math.floor(Math.max(0,now-baselineMs)/60_000),
    hot_freshness_not_asserted:true,
    source_news_freshness_not_asserted:true,
    independently_rechecked_b2_now:false,
    independently_verified_archive_at_past_write:true,
    signed_country_gro_coverage_not_asserted:true,
    commercial_eligible:false,
    x402_chargeable:false,
    usdc_spent:0,
    source_rights_not_recertified:true,
  };
}
