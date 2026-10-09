/**
 * P0 #1827: independently attest that the deployed Intelligence Worker
 * projects a CURRENT, verified, B2-hash-bound Cloudflare D1 observation
 * overlay. This does NOT certify the Lovable-published website or current
 * classifier-scored coverage. Those remain separate, mandatory release gates.
 *
 * All inputs are public read-only responses; no direct B2 GET, Supabase,
 * archive writes, source rights promotion, x402, or real-money activity.
 */
import { summarizePublicIntelligenceFreshness } from "./public-intelligence-freshness-audit.mjs";

const SHA=/^[a-f0-9]{64}$/u;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const OVERLAY_SCHEMA="geomacro.public-intelligence-live-observed.v1";
const EDGE_SCHEMA="geomacro.public-intelligence-live.v1";
const OVERLAY_MAX_BYTES=30_000;
const MAX_ROWS=300;
const MAX_HOT_AGE_MS=6*60*60_000;

function isoMs(value,now) {
  if (typeof value!=="string") return NaN;
  const ms=Date.parse(value);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString()===value &&
    ms>0 && ms<=now+5*60_000 ? ms : NaN;
}
const onlyPublicRowFields=new Set([
  "id","source_title","summary","category","severity","delta",
  "created_at","published_at","public_status",
]);

function validUnscoredRow(r,now) {
  const time=isoMs(r?.published_at??r?.created_at,now);
  return r && typeof r==="object" && !Array.isArray(r) &&
    Object.keys(r).every(k=>onlyPublicRowFields.has(k)) &&
    typeof r.id==="string" && r.id.length>0 &&
    typeof r.source_title==="string" &&
    r.source_title.startsWith("Geomacro observes ") &&
    r.source_title.length<=280 &&
    r.category==="geopolitics" &&
    r.public_status==="live_observed" &&
    r.severity===null && r.delta===null &&
    Number.isFinite(time) && now-time<=MAX_HOT_AGE_MS;
}

export function verifyIntelligenceWorkerB2D1Deployment({
  edge,overlay,now=Date.now(),
}={}) {
  if(!Number.isFinite(now))throw new Error("INTELLIGENCE_EDGE_DEPLOY_CLOCK_INVALID");
  const summary=summarizePublicIntelligenceFreshness({
    edge,overlay,site:{status:0},now,
  });
  if(summary.current_overlay_state!=="D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE" ||
     summary.b2_bound_edge_authority_verified!==true ||
     summary.public_edge_http_status!==200)
    throw new Error("INTELLIGENCE_EDGE_DEPLOY_B2_D1_NOT_CONVERGED");

  const e=edge?.payload,o=overlay?.payload;
  const generated=isoMs(e?.generated_at,now);
  const overlayGenerated=isoMs(o?.generated_at,now);
  const originalBatch=isoMs(o?.current_source_batch_at,now);
  const b2Generated=isoMs(o?.verified_b2_generated_at,now);
  if(!Number.isFinite(generated) || !Number.isFinite(overlayGenerated) ||
    !Number.isFinite(originalBatch) || !Number.isFinite(b2Generated) ||
    now-originalBatch>MAX_HOT_AGE_MS ||
    generated!==overlayGenerated ||
    !SHA.test(String(edge?.b2_sha256??"")) ||
    edge?.b2_sha256!==o?.verified_b2_sha256 ||
    o?.verified_b2_sha256!==overlay?.verified_b2_sha256 ||
    e?.schema!==EDGE_SCHEMA ||
    e?.source_project!=="ldpwajisioljyjtojvfx" ||
    e?.current_overlay_authority!=="cloudflare-d1-control-plane" ||
    e?.current_overlay_source_batch_at!==o?.current_source_batch_at ||
    e?.current_evidence_contract!==o?.current_evidence_contract ||
    o?.ok!==true || o?.schema!==OVERLAY_SCHEMA ||
    o?.source_id!=="gdelt_v2_events" ||
    o?.verified_b2_key!=="geomacro-evidence/v1/live/public-intelligence/latest.json.gz" ||
    o?.full_b2_readback_verified!==true ||
    o?.exact_gzip_restore_verified!==true ||
    o?.raw_source_headlines_exposed!==false ||
    o?.provider_identity_exposed!==false ||
    o?.synthetic_score!==false ||
    !Array.isArray(o?.rows) || o.rows.length<1 || o.rows.length>MAX_ROWS ||
    !o.rows.every(row=>validUnscoredRow(row,now)) ||
    !Array.isArray(e?.rows) ||
    e.rows.length < CATEGORIES.length || e.rows.length>MAX_ROWS ||
    e.rows.length!==o.rows.length + e.rows.filter(r=>r?.public_status==="verified_b2").length ||
    !CATEGORIES.every(category=>e.rows.some(r=>
      r?.category===category && r?.public_status==="verified_b2" &&
      typeof r?.severity==="number" &&
      Number.isFinite(r.severity) && r.severity>=0 && r.severity<=100
    )) ||
    !o.rows.every(row=>e.rows.some(candidate=>
      candidate?.public_status==="live_observed" &&
      candidate?.id===row.id &&
      candidate?.source_title===row.source_title &&
      candidate?.published_at===row.published_at &&
      candidate?.severity===null && candidate?.delta===null
    )))
    throw new Error("INTELLIGENCE_EDGE_DEPLOY_VERIFIED_OVERLAY_INVALID");

  return {
    ok:true,
    schema:"geomacro.intelligence-edge-worker-only-deploy-acceptance.v1",
    worker_deployed_with_b2_d1_current_overlay:true,
    edge_b2_hash_equals_d1_verified_anchor:true,
    observation_source_batch_at:o.current_source_batch_at,
    current_source_observation_count:o.rows.length,
    historical_scored_categories:CATEGORIES,
    website_deployment_parity_checked:false,
    website_current_within_24h_not_asserted:true,
    three_domain_current_scored_ready_not_asserted:true,
    commercial_ready:false,
    signed_gro_coverage_not_asserted:true,
    source_rights_not_recertified:true,
    paid_response_delivered:false,
    external_payment_performed:false,
    supabase_reads:0,
    direct_b2_reads:0,
  };
}
