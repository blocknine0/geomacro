#!/usr/bin/env node
/**
 * Independent real-deployment readiness receipt.
 *
 * Explicitly distinguishes a free, first-party, derived-only observation
 * from the independently qualified signed GRO sold by the payment endpoint.
 * Read-only: no payment signature, wallet, settlement, DB/B2 writes or retry.
 * Publisher URLs, original texts and public response bodies are never logged.
 */
const CATEGORIES = Object.freeze(["geopolitics","macro-fx","critical-minerals"]);
const OBS_SCHEMA = "geomacro.category-live-official-observation.v1";
const RECEIPT_SCHEMA = "geomacro.earning-journey-readonly.v1";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LIMIT_MS = 15 * 60 * 1000;
const HEX_SHA = /^[a-f0-9]{40}$/;
const ALLOWED_STATUS = new Set([
  "CURRENT_OFFICIAL_OBSERVATIONS_AVAILABLE",
  "NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H",
  "OFFICIAL_SOURCES_UNAVAILABLE",
]);

function assert(condition, code) { if (!condition) throw Error(code); }
function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isoTime(v) {
  return typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0,19) === v.slice(0,19);
}
function validDate(v) {
  return typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(Date.parse(v)).toISOString().slice(0,10) === v;
}
function safeText(v,max) {
  return typeof v === "string" && v.trim().length>0 && v.length<=max &&
    !/(?:https?:\/\/|www\.|<script|payment-signature|source_url|raw_payload)/i.test(v);
}
function reject(code) { throw Error(code); }

export function verifyLatestObservation(payload,category,nowMs){
  assert(object(payload) && payload.schema_version===OBS_SCHEMA &&
    payload.ok===true && payload.category===category,
    "ORIGINAL_LIVE_RESPONSE_SCHEMA_INVALID");
  assert(ALLOWED_STATUS.has(payload.status) && isoTime(payload.checked_at) &&
    Date.parse(payload.checked_at)<=nowMs+60_000 &&
    Date.parse(payload.checked_at)>=nowMs-15*60_000,
    "ORIGINAL_LIVE_CHECK_CLOCK_INVALID");
  assert(payload.observation_mode==="UNSCORED_OFFICIAL_RELEASES" &&
    payload.publication_delay_minutes===15 &&
    payload.max_original_age_hours===24 &&
    payload.source_urls_disclosed===false &&
    payload.raw_publisher_content_delivered===false &&
    payload.current_signed_risk_intelligence_verified===false &&
    payload.independent_same_event_verification===false &&
    payload.signed_gro_generated===false &&
    payload.x402_payment_required===false &&
    payload.paid_delivery_authorized_by_observations===false &&
    payload.production_paid_result_verified===false &&
    payload.durable_storage_written===false,
    "ORIGINAL_LIVE_UNAUTHORIZED_PAID_PROMOTION");
  assert(Array.isArray(payload.findings) && payload.findings.length<=3 &&
    Array.isArray(payload.licensed_source_credits) &&
    payload.licensed_source_credits.length<=4 &&
    payload.licensed_source_credits.every(x=>safeText(x,250)) &&
    payload.source_identity_disclosed_for_mandatory_credit_only===
      (payload.licensed_source_credits.length>0),
    "ORIGINAL_LIVE_SOURCE_PROVENANCE_INVALID");
  const ids=new Set();let last=Infinity;
  for(const row of payload.findings){
    assert(object(row) && safeText(row.id,160) &&
      !ids.has(row.id) && safeText(row.topic,200) &&
      safeText(row.what_changed,1100) &&
      safeText(row.why_it_matters,1100) &&
      row.evidence_class==="original_publisher_release_unscored" &&
      row.same_event_corroborated===false && row.risk_score===null &&
      ["exact","day"].includes(row.date_precision) &&
      (row.date_precision==="exact" ? isoTime(row.published_at) : validDate(row.published_at)),
      "ORIGINAL_LIVE_FINDING_SCHEMA_INVALID");
    ids.add(row.id);
    const date=Date.parse(row.published_at);
    // Day-only originals cannot pretend to have a midnight "published hour";
    // the verified source reader's next-day 12:15 UTC cutoff is independent.
    const embargo=row.date_precision==="exact"
      ? date+LIMIT_MS
      : date+DAY+12*HOUR+LIMIT_MS;
    assert(date<=last && date>=nowMs-DAY &&
      embargo<=nowMs, "ORIGINAL_LIVE_FINDING_FRESHNESS_INVALID");
    last=date;
  }
  assert(payload.findings.length>0 ?
    payload.status==="CURRENT_OFFICIAL_OBSERVATIONS_AVAILABLE" :
    payload.status!=="CURRENT_OFFICIAL_OBSERVATIONS_AVAILABLE",
    "ORIGINAL_LIVE_STATUS_COUNT_MISMATCH");
  assert((payload.findings[0]?.published_at??null)===
    payload.latest_original_published_at,"ORIGINAL_LIVE_LATEST_CLOCK_MISMATCH");
  return {category,contract_verified:true,status:payload.status,
    eligible_original_release_count:payload.findings.length,
    paid_intelligence_deliverable:false};
}

export function verifyPublicBuild(marker,expectedSha){
  assert(HEX_SHA.test(expectedSha), "DEPLOYED_EXPECTED_SHA_INVALID");
  assert(object(marker) && marker.schema_version==="geomacro.deployment-build.v1" &&
    marker.canonical_repository==="blocknine0/geomacro" &&
    marker.canonical_main_sha===expectedSha &&
    marker.production_activation_performed===false,
    "DEPLOYED_EXACT_SHA_NOT_VERIFIED");
  return true;
}

export async function inspectFirstEarningJourney({
  origin="https://geomacro.live",expectedSha,
  fetchImpl=fetch,now=new Date(),
}={}){
  const base=new URL(origin);
  assert(base.protocol==="https:"&&!base.username&&!base.password&&
    base.pathname==="/"&&!base.search&&!base.hash &&
    HEX_SHA.test(String(expectedSha??"")),
    "EARNING_JOURNEY_INPUT_INVALID");
  const result={
    schema_version:RECEIPT_SCHEMA,checked_at:now.toISOString(),
    expected_deployed_main_sha:expectedSha,exact_main_published:false,
    free_category_contracts_verified:0,free_category_live_findings:0,
    free_category_healthy_count:0,paid_signed_gro_verified:false,
    mainnet_payment_configured_proven:false,first_real_earning_ready:false,
    payment_signature_sent:false,settlement_or_charge_attempted:false,
    raw_publisher_data_logged:false,category_checks:[],
  };
  async function get(path){
    const r=await fetchImpl(new URL(path,base),{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json",
        "User-Agent":"Geomacro-NoFunds-Separate-Buyer-Readiness/1"},
      signal:AbortSignal.timeout(15_000),
    });
    if(r.status!==200)reject("EARNING_JOURNEY_HTTP_UNAVAILABLE");
    return r.json();
  }
  try{
    verifyPublicBuild(await get("/.well-known/geomacro-build.json"),expectedSha);
    result.exact_main_published=true;
  }catch{result.deployment_failure_code="EXACT_MAIN_PUBLICATION_NOT_VERIFIED";
    return result;}
  for(const category of CATEGORIES){
    try{
      const payload=await get("/api/v1/intelligence/"+category+"?view=latest");
      const check=verifyLatestObservation(payload,category,now.getTime());
      result.category_checks.push(check);
      result.free_category_contracts_verified++;
      result.free_category_live_findings+=check.eligible_original_release_count;
      if(check.status!=="OFFICIAL_SOURCES_UNAVAILABLE")
        result.free_category_healthy_count++;
    }catch(error){
      const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)
        ?error.message:"ORIGINAL_LIVE_REQUEST_FAILED";
      result.category_checks.push({category,contract_verified:false,
        error_code:code,paid_intelligence_deliverable:false});
    }
  }
  // This audit DOES NOT send POST, payment headers or challenge settlement.
  // Positive free transport never becomes a claim of signed paid delivery.
  return result;
}

if(process.argv[1]?.endsWith("verify-first-earning-separate-live.mjs")){
  try{
    const result=await inspectFirstEarningJourney({
      origin:process.env.GEOMACRO_BASE_URL||"https://geomacro.live",
      expectedSha:process.env.EXPECTED_CANONICAL_SHA,
    });
    console.log(JSON.stringify(result));
    // On pull requests the latest source may not yet be deployed. Report an
    // honest warning receipt, not a fake green x402 acceptance. The main
    // branch/watch dispatch is strict about real published GET deliverability.
    if(!process.argv.includes("--diagnostic-only") &&
      (!result.exact_main_published||result.free_category_contracts_verified!==3))
      process.exitCode=1;
  }catch(error){
    const code=error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ?error.message:"EARNING_JOURNEY_DIAGNOSTIC_ERROR";
    console.log(JSON.stringify({schema_version:RECEIPT_SCHEMA,ok:false,
      first_real_earning_ready:false,payment_signature_sent:false,
      settlement_or_charge_attempted:false,failure_code:code}));
    process.exitCode=1;
  }
}
