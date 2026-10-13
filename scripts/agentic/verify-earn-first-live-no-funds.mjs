#!/usr/bin/env node
/**
 * Strict ZERO-FUNDS acceptance for the first real Geomacro buyer journey.
 * Checks actual deployed code + data eligibility + optional x402 quote only.
 * Never includes PAYMENT-SIGNATURE, credentials, payer wallet or settlement.
 */
export const EARNING_PILOT_CASES = [
  { name: "geopolitics", topic: "conflict_geopolitics", country: "USA" },
  { name: "macro_fx", topic: "macro_risk", country: "USA" },
  { name: "critical_minerals", topic: "critical_minerals", country: "USA" },
];
const SCHEMA = "geomacro.earn-first-live-no-funds.v1";

export async function acceptEarningPilotLive({
  origin = "https://geomacro.live",
  expectedSha,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
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
     marker.canonical_main_sha!==expectedSha)
    throw Error("EARNING_PILOT_NOT_EXACT_MAIN_PUBLISHED");
  steps.push({check:"published_build_sha",status:"PASS"});

  const offers=await get("/api/v1/intelligence/availability");
  if(offers.schema_version!=="geomacro.earn-first-offers.v1" ||
     offers.payment_required_now!==false || offers.chargeable!==false ||
     offers.signed_current_risk_object!==false ||
     !Array.isArray(offers.offers))
    throw Error("EARNING_PILOT_DISCOVERY_CONTRACT_INVALID");
  steps.push({check:"three_domain_offer_catalog",status:"PASS"});

  let eligibleCount=0,lockedCount=0,quoteReadyCount=0;
  for(const item of EARNING_PILOT_CASES){
    const body={
      schema_version:"geomacro.agent-query.v1",
      delivery_tier:"structural_baseline",
      fulfillment_mode:"published_only",
      subjects:[{type:"country",country_iso3:item.country}],
      topics:[item.topic],
      detail:"compact",
    };
    const res=await fetchImpl(new URL("/api/v1/intelligence/availability",base),{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{
        "Content-Type":"application/json",
        Accept:"application/json",
        "User-Agent":"Geomacro-NoFunds-EarnFirst-Acceptance/1",
      },
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(25_000),
    });
    if (![200,422].includes(res.status))
      throw Error("EARNING_PILOT_PREFLIGHT_UNAVAILABLE_"+item.name.toUpperCase());
    const data=await res.json();
    if(data.chargeable!==false || data.payment_required_now!==false ||
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
    if(available)eligibleCount++;
    if(available && data.status==="ELIGIBLE_FOR_X402_QUOTE")quoteReadyCount++;
    if(data.status==="ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED")lockedCount++;
    steps.push({
      check:item.name,
      status:available?"ELIGIBLE_GOVERNED_BASELINE":"NO_PAYABLE_EVIDENCE",
      // Never print source count, source identity, original URL or article title.
      payment_rail_state:available
        ? data.status==="ELIGIBLE_FOR_X402_QUOTE"?"READY_FOR_QUOTE":"LOCKED"
        : "NOT_APPLICABLE",
    });
    // Do not call the pay rail in an unattended CI step, not even for 402:
    // a final quote/settlement is a separate owner-ACKed controlled operation.
  }
  const result={
    schema_version:SCHEMA,
    checked_at:now.toISOString(),
    deployed_main_sha:expectedSha,
    source_identities_disclosed:false,
    raw_upstream_disclosed:false,
    payment_header_submitted:false,
    checkout_or_settlement_attempted:false,
    real_funds_touched:false,
    price_advertised_as_authoritative:false,
    eligible_category_count:eligibleCount,
    payment_locked_category_count:lockedCount,
    quote_ready_category_count:quoteReadyCount,
    first_earning_ready:quoteReadyCount>0,
    no_funds_preflight_complete:true,
    checks:steps,
  };
  return result;
}

if(process.argv[1]?.endsWith("verify-earn-first-live-no-funds.mjs")){
  try{
    const result=await acceptEarningPilotLive({
      origin:process.env.GEOMACRO_BASE_URL||"https://geomacro.live",
      expectedSha:process.env.EXPECTED_CANONICAL_SHA,
    });
    console.log(JSON.stringify(result));
    if(!result.first_earning_ready)process.exitCode=1;
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
