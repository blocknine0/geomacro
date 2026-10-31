#!/usr/bin/env node
/**
 * Strict ZERO-FUNDS acceptance for the first real Geomacro buyer journey.
 * Checks actual deployed code + data eligibility + optional x402 quote only.
 * Never includes PAYMENT-SIGNATURE, credentials, payer wallet or settlement.
 */
import {verifyFirstSalePriceManifest} from "./first-sale-price-proof.mjs";
export const EARNING_PILOT_CASES = [
  { name: "geopolitics", topic: "conflict_geopolitics", country: "USA", store_digest: true },
  { name: "macro_fx", topic: "macro_risk", country: "USA", store_digest: true },
  { name: "critical_minerals", topic: "critical_minerals", country: "USA",
    first_sale_product: true },
];
// One bounded alternate-market diagnosis reuses the exact same governed
// availability endpoint, with no additional source spider, B2 scan or wallet.
// It can never confer production earning authorization (even if one offer
// appears available); that requires exact-live canonical main buyer acceptance.
export const EARNING_PILOT_ALTERNATE_CASES = Object.freeze([
  Object.freeze({ name: "geopolitics", topic: "conflict_geopolitics", country: "UKR", store_digest: true }),
  Object.freeze({ name: "macro_fx", topic: "macro_risk", country: "BRA", store_digest: true }),
  Object.freeze({ name: "critical_minerals", topic: "critical_minerals", country: "AUS",
    first_sale_product: true }),
]);
/** Choose exactly one of two approved three-case sets on existing six-hour diagnostics.
 * Every result is no-funds diagnostic, not a payment or launch authorization.
 */
export function scheduledEarningPilotCases(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("EARNING_PILOT_SCHEDULE_CLOCK_INVALID");
  return Math.floor(now.getUTCHours()/6)%2===1
    ? EARNING_PILOT_ALTERNATE_CASES : EARNING_PILOT_CASES;
}
const SCHEMA = "geomacro.earn-first-live-no-funds.v1";
const PUBLIC_PREFLIGHT_DENIAL_CODES = new Set([
  "CENTRAL_SECURITY_UNAVAILABLE",
  "CENTRAL_SECURITY_KEY_UNAVAILABLE",
  "REAL_FUNDS_SECURITY_GATE_LOCKED",
  "PREFLIGHT_GOVERNED_DATA_UNAVAILABLE",
  "PREFLIGHT_RATE_LIMITED",
  "PREFLIGHT_INVALID_REQUEST",
  "PREFLIGHT_SCOPE_VIOLATION",
  "NOT_AVAILABLE",
  "INSUFFICIENT_COVERAGE",
  "STALE_REQUIRED_DATA",
]);
// Only allow-listed coarse gate names leave the private preflight. Never log
// server error messages, original URL, publisher/source identities, response
// bodies, wallet fields, or provider backend diagnostics.
async function safePublicBlockerCode(response) {
  try {
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") ||
        Number(response.headers.get("content-length") || 0) > 4_096)
      return "UNKNOWN_PREFLIGHT_BLOCKER";
    const reader=response.body?.getReader();
    if (!reader) return "UNKNOWN_PREFLIGHT_BLOCKER";
    const chunks=[];let bytes=0;
    try {
      while (true) {
        const {done,value}=await reader.read();
        if (done) break;
        bytes+=value.byteLength;
        if (bytes>4_096) return "UNKNOWN_PREFLIGHT_BLOCKER";
        chunks.push(value);
      }
    } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const combined=new Uint8Array(bytes);let offset=0;
    for (const part of chunks){combined.set(part,offset);offset+=part.length;}
    const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(combined));
    const code=parsed?.error?.code;
    return typeof code==="string" && PUBLIC_PREFLIGHT_DENIAL_CODES.has(code)
      ? code : "UNKNOWN_PREFLIGHT_BLOCKER";
  } catch {return "UNKNOWN_PREFLIGHT_BLOCKER";}
}
function safeCount(value) {
  return Number.isSafeInteger(value) && value>=0 && value<=1000 ? value : null;
}
// These names are already public deterministic query modules, NEVER private
// publisher IDs, article URLs or source inventory keys. Only this exact
// allowlist may appear in logged eligibility diagnostics.
const PUBLIC_MODULE_NAMES = new Set([
  "sovereign_fiscal", "political_governance", "macro_monetary",
  "external_fx", "geopolitical_security", "critical_minerals",
  "sanctions_restrictions", "trade_corridor", "energy_commodities",
  "banking_financial_system", "food_agriculture", "natural_hazards",
]);
function safePublicModuleNames(rows) {
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.slice(0,32).filter(value =>
    typeof value === "string" && PUBLIC_MODULE_NAMES.has(value),
  ))].sort();
}
function publicCoverageCounts(body) {
  const availability=body?.availability;
  return {
    missing_module_count:Array.isArray(availability?.missing_modules)
      ? Math.min(availability.missing_modules.length,1000) : null,
    stale_module_count:Array.isArray(availability?.stale_modules)
      ? Math.min(availability.stale_modules.length,1000) : null,
    ineligible_source_count:safeCount(availability?.ineligible_source_count),
    missing_public_modules:safePublicModuleNames(availability?.missing_modules),
    stale_public_modules:safePublicModuleNames(availability?.stale_modules),
  };
}

export async function acceptEarningPilotLive({
  origin = "https://geomacro.live",
  expectedSha,
  diagnosticOnly = false,
  pilotCases = EARNING_PILOT_CASES,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const alternateProfile = pilotCases === EARNING_PILOT_ALTERNATE_CASES;
  if (pilotCases !== EARNING_PILOT_CASES && !alternateProfile)
    throw Error("EARNING_PILOT_COUNTRY_SET_UNAPPROVED");
  if (alternateProfile && !diagnosticOnly)
    throw Error("EARNING_PILOT_ALTERNATE_REQUIRES_DIAGNOSTIC_MODE");
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password ||
      base.search || base.hash || base.pathname !== "/" ||
      !/^[a-f0-9]{40}$/.test(String(expectedSha ?? "")))
    throw Error("EARNING_PILOT_ORIGIN_OR_COMMIT_INVALID");
  const steps = [];
  const get = async path => {
    const res = await fetchImpl(new URL(path,base),{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json","User-Agent":"Geomacro-NoFunds-EarnFirst-Acceptance/1"},
      signal:AbortSignal.timeout(12_000),
    });
    if (!res.ok)throw Error("EARNING_PILOT_READ_ONLY_GET_UNAVAILABLE");
    return res.json();
  };
  const marker=await get("/.well-known/geomacro-build.json");
  if(marker.schema_version!=="geomacro.deployment-build.v1" ||
     marker.canonical_repository!=="blocknine0/geomacro" ||
     !/^[a-f0-9]{40}$/.test(String(marker.canonical_main_sha??"")))
    throw Error("EARNING_PILOT_BUILD_MARKER_INVALID");
  const exactMainPublished=marker.canonical_main_sha===expectedSha;
  if(!exactMainPublished && !diagnosticOnly)
    throw Error("EARNING_PILOT_NOT_EXACT_MAIN_PUBLISHED");
  // Explicit PR diagnostic may inspect an older deployed version at most
  // once per country/domain, without a wallet. It is NOT a quote-authorizing
  // production check: a stale deployment can never return earning_ready.
  steps.push({check:"published_build_sha",
    status:exactMainPublished?"PASS":"PUBLISHED_SHA_MISMATCH_DIAGNOSTIC_ONLY"});

  const offers=await get("/api/v1/intelligence/availability");
  if(offers.schema_version!=="geomacro.earn-first-offers.v1" ||
     offers.payment_required_now!==false || offers.chargeable!==false ||
     offers.signed_current_risk_object!==false ||
     !Array.isArray(offers.offers))
    throw Error("EARNING_PILOT_DISCOVERY_CONTRACT_INVALID");
  steps.push({check:"three_domain_offer_catalog",status:"PASS"});
  // Read one extra PUBLIC catalog; never call the paid POST or accept payment.
  // A merchant's exact-price receipt MUST still come from the canonical 402.
  const publicPricing=await get("/api/v1/pricing");
  let firstSalePrice;
  try {
    firstSalePrice=verifyFirstSalePriceManifest(publicPricing);
  } catch(error) {
    // PR diagnostics run BEFORE this pricing version can be published.
    // Do not pretend the old deployed catalog is compatible, and never
    // authorize payment or treat this as an accepted production preflight.
    // Main/push acceptance remains strict and throws the original error.
    if(diagnosticOnly &&
       publicPricing?.pricing_version==="geomacro.capability-usdc.v1" &&
       error instanceof Error &&
       error.message==="FIRST_SALE_PRICING_MANIFEST_INVALID"){
      return {
        schema_version:SCHEMA,ok:false,diagnostic_only:true,
        checked_at:now.toISOString(),
        country_profile:alternateProfile?"ALTERNATE_COUNTRIES_DIAGNOSTIC_ONLY":"DEFAULT_COUNTRIES",
        expected_pricing_version:"geomacro.capability-usdc.v2",
        observed_pricing_version:"geomacro.capability-usdc.v1",
        failure_code:"LEGACY_DEPLOYED_PRICING_DIAGNOSTIC_ONLY",
        first_earning_ready:false,first_sale_exact_product_preflight_verified:false,
        no_funds_preflight_complete:false,
        exact_main_published:exactMainPublished,
        source_identities_disclosed:false,raw_upstream_disclosed:false,
        payment_header_submitted:false,checkout_or_settlement_attempted:false,
        payment_authorized:false,real_funds_touched:false,
        price_advertised_as_authoritative:false,
        checks:[...steps,{check:"pricing_catalog",
          status:"PUBLISHED_LEGACY_VERSION_NOT_ELIGIBLE"}],
      };
    }
    throw error;
  }

  let eligibleCount=0,lockedCount=0,quoteReadyCount=0;
  let firstSaleExplicitEligible=0,firstSaleExplicitQuoteReady=0;
  let governedUnavailableCount=0,requestFailureCount=0;
  // This is a diagnostic, not a purchase operation. Each country/domain is
  // separately checked; a 503/429 for one must not hide another genuine
  // eligible buyer offer. Do not read or log error response bodies.
  for(const item of pilotCases){
    const body={
      schema_version:"geomacro.agent-query.v1",
      ...((item.first_sale_product || item.store_digest) ? {product:{
        capability:"structural_country_digest",variant:"standard"
      }} : {}),
      delivery_tier:"structural_baseline",
      fulfillment_mode:"published_only",
      subjects:[{type:"country",country_iso3:item.country}],
      topics:[item.topic],
      detail:"compact",
    };
    let res;
    try{
      res=await fetchImpl(new URL("/api/v1/intelligence/availability",base),{
        method:"POST",redirect:"error",cache:"no-store",
        headers:{
          "Content-Type":"application/json",
          Accept:"application/json",
          "User-Agent":"Geomacro-NoFunds-EarnFirst-Acceptance/1",
        },
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(25_000),
      });
    }catch{
      requestFailureCount++;
      steps.push({check:item.name,country_iso3:item.country,topic:item.topic,status:"PREFLIGHT_TRANSPORT_UNAVAILABLE",
        payment_rail_state:"NOT_APPLICABLE"});
      continue;
    }
    if (![200,422].includes(res.status)){
      requestFailureCount++;
      // Only coarse HTTP classes; never print an upstream body, private
      // provider name, endpoint path or untrusted error message.
      const code=res.status===429?"PREFLIGHT_RATE_LIMITED":
        res.status>=500?"PREFLIGHT_SERVER_UNAVAILABLE":
        res.status===401||res.status===403?"PREFLIGHT_ACCESS_DENIED":
        "PREFLIGHT_UNEXPECTED_HTTP_STATUS";
      // The original error body may contain private backend details. Read at
      // most 4 KiB and emit one public allow-listed gate code; never copy
      // arbitrary provider responses to the GitHub or user-facing logs.
      const blocker=await safePublicBlockerCode(res);
      steps.push({check:item.name,country_iso3:item.country,topic:item.topic,status:code,http_status:res.status,
        blocker_code:blocker,payment_rail_state:"NOT_APPLICABLE"});
      continue;
    }
    let data;
    try{data=await res.json();}catch{
      requestFailureCount++;
      steps.push({check:item.name,country_iso3:item.country,topic:item.topic,status:"PREFLIGHT_INVALID_RESPONSE",
        payment_rail_state:"NOT_APPLICABLE"});
      continue;
    }
    if(!data || typeof data!=="object" ||
       data.chargeable!==false || data.payment_required_now!==false ||
       data.execution_authorized!==false ||
       JSON.stringify(data).includes("source_contracts") ||
       JSON.stringify(data).includes("required_source_ids") ||
       JSON.stringify(data).includes("source_url"))
      throw Error("EARNING_PILOT_PRIVATE_OR_PAYMENT_BOUNDARY_INVALID");
    const available=res.status===200 && data.ok===true &&
       data.delivery_tier==="structural_baseline" &&
       /^[a-f0-9]{64}$/.test(String(data.query_plan_hash??""));
    if (res.status===200 && !available)
      throw Error("EARNING_PILOT_FALSE_POSITIVE_"+item.name.toUpperCase());
    if(available && !["ELIGIBLE_FOR_X402_QUOTE",
      "ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED"].includes(data.status))
      throw Error("EARNING_PILOT_UNKNOWN_RAIL_STATUS_"+item.name.toUpperCase());
    if(res.status===422 && data.ok===true)
      throw Error("EARNING_PILOT_FALSE_POSITIVE_"+item.name.toUpperCase());
    if(available)eligibleCount++;
    if(available && data.status==="ELIGIBLE_FOR_X402_QUOTE")quoteReadyCount++;
    if(available&&item.first_sale_product)firstSaleExplicitEligible++;
    if(available&&item.first_sale_product&&
       data.status==="ELIGIBLE_FOR_X402_QUOTE")firstSaleExplicitQuoteReady++;
    if(available && data.status==="ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED")lockedCount++;
    if(!available)governedUnavailableCount++;
    steps.push({
      check:item.name,country_iso3:item.country,topic:item.topic,
      status:available?"ELIGIBLE_GOVERNED_BASELINE":"NO_PAYABLE_EVIDENCE",
      // Aggregate module + rights counts only. Source identities and
      // raw upstream data are never part of this buyer preflight receipt.
      ...(!available?publicCoverageCounts(data):{}),
      payment_rail_state:available
        ? data.status==="ELIGIBLE_FOR_X402_QUOTE"?"READY_FOR_QUOTE":"LOCKED"
        : "NOT_APPLICABLE",
    });
    // Neither this preflight nor its error diagnostics call the paid route.
  }
  const result={
    schema_version:SCHEMA,
    checked_at:now.toISOString(),
    country_profile:alternateProfile?"ALTERNATE_COUNTRIES_DIAGNOSTIC_ONLY":"DEFAULT_COUNTRIES",
    deployed_main_sha:expectedSha,
    exact_main_published:exactMainPublished,
    diagnostic_only:diagnosticOnly,
    source_identities_disclosed:false,
    raw_upstream_disclosed:false,
    payment_header_submitted:false,
    checkout_or_settlement_attempted:false,
    real_funds_touched:false,
    price_advertised_as_authoritative:false,
    first_sale_catalog_only: firstSalePrice,
    eligible_category_count:eligibleCount,
    payment_locked_category_count:lockedCount,
    quote_ready_category_count:quoteReadyCount,
    first_sale_exact_product_preflight_verified: true,
    first_sale_explicit_eligible_count:firstSaleExplicitEligible,
    first_sale_explicit_quote_ready_count:firstSaleExplicitQuoteReady,
    first_sale_product:"structural_country_digest",
    first_sale_variant:"standard",
    first_sale_catalog_price_usdc:firstSalePrice.catalog_only_usdc,
    first_sale_offer_is_not_settlement:true,
    governed_no_payable_category_count:governedUnavailableCount,
    preflight_transport_error_category_count:requestFailureCount,
    first_earning_ready:!diagnosticOnly && !alternateProfile &&
      exactMainPublished && firstSalePrice.founder_price_catalog_verified &&
      firstSaleExplicitQuoteReady>0,
    no_funds_preflight_complete:true,
    checks:steps,
  };
  return result;
}

if(process.argv[1]?.endsWith("verify-earn-first-live-no-funds.mjs")){
  try{
    if(process.argv.includes("--auto-country-probe") &&
       !process.argv.includes("--diagnostic-only"))
       throw Error("EARNING_PILOT_ROTATION_DIAGNOSTIC_ONLY");
    const result=await acceptEarningPilotLive({
      origin:process.env.GEOMACRO_BASE_URL||"https://geomacro.live",
      expectedSha:process.env.EXPECTED_CANONICAL_SHA,
      diagnosticOnly:process.argv.includes("--diagnostic-only"),
      pilotCases:process.argv.includes("--auto-country-probe")
        ? scheduledEarningPilotCases(new Date()) :
        process.argv.includes("--alternate-country-probe")
          ? EARNING_PILOT_ALTERNATE_CASES : EARNING_PILOT_CASES,
    });
    console.log(JSON.stringify(result));
    // PR diagnostics are read-only observation, NOT earning acceptance.
    // Only the canonical main push demands an actually eligible quote-ready
    // module; diagnostic 503/429 stays prominently visible as a blocker.
    if(!result.first_earning_ready && !process.argv.includes("--diagnostic-only"))
      process.exitCode=1;
  }catch(error){
    console.log(JSON.stringify({
      schema_version:SCHEMA,ok:false,first_earning_ready:false,
      real_funds_touched:false,
      failure_code:error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message:"EARNING_PILOT_RUNTIME_UNAVAILABLE",
    }));
    process.exitCode=1;
  }
}
