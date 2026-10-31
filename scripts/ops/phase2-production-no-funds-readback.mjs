#!/usr/bin/env node
/**
 * Phase 2 Step 3 PRODUCTION read-only crosscheck, never a PR-branch deployment
 * claim. This runner only performs safe GET and unauthenticated live_on_demand
 * POST discovery: no PAYMENT-SIGNATURE, no quote acceptance, no settlement.
 * No raw response body or upstream source identity is written to artifacts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const base="https://geomacro.live";
const expected=String(process.env.GEOMACRO_EXPECTED_DEPLOYED_SHA||"").toLowerCase();
const cases=[
  {id:"RUS_HISTORICAL_GEO",country:"RUS",topic:"conflict_geopolitics",
   question:"Russia conflict developments in the past 31 days",age:31*86400},
  // The published Board minutes are a historical event by 15 October,
  // NEVER a new rate decision. Reuse the exact canonical customer route.
  // These replace the two general CHN macro probes, NOT add two expensive
  // provider bursts: RUS/GBR and the separate CHN API acceptance remain.
  {id:"USA_FED_HISTORICAL",country:"USA",topic:"macro_risk",
   question:"When did the Federal Reserve Board publish its August and September 2026 discount-rate meeting minutes?",
   age:7*86400},
  {id:"GBR_HISTORICAL_LITHIUM",country:"GBR",topic:"critical_minerals",
   question:"UK lithium announcements in the past 31 days",age:31*86400},
  {id:"USA_FED_CURRENT_REJECTION",country:"USA",topic:"macro_risk",
   question:"When did the Federal Reserve Board publish its August and September 2026 discount-rate meeting minutes?",
   age:86400},
];
const report={
  schema:"geomacro.phase2-production-no-funds.v1",
  checked_at:new Date().toISOString(),
  expected_sha:expected,deployed_sha:null,exact_sha_verified:false,
  canonical_get:null,category_gets:[],cases:[],
  payment_attempts:0,settlement_attempts:0,source_payloads_preserved:false,
};
const json=async(url,init={})=>{
  const response=await fetch(url,{
    ...init,redirect:"error",cache:"no-store",
    signal:AbortSignal.timeout(25000),
    headers:{"content-type":"application/json","accept":"application/json",
      "cache-control":"no-cache",...(init.headers||{})},
  });
  const raw=await response.text();
  if(raw.length>60000)throw Error("PRODUCTION_RESPONSE_TOO_LARGE");
  let body=null;
  try{body=JSON.parse(raw);}catch{}
  return {http:response.status,body};
};
let failed=false;
try{
  if(!/^[a-f0-9]{40}$/u.test(expected))throw Error("EXPECTED_CANONICAL_SHA_MISSING");
  const build=await json(base+"/.well-known/geomacro-build.json");
  const b=build.body;
  report.deployed_sha=typeof b?.canonical_main_sha==="string"
    ?b.canonical_main_sha.toLowerCase():null;
  report.exact_sha_verified=build.http===200 &&
    b?.schema_version==="geomacro.deployment-build.v1" &&
    b?.canonical_repository==="blocknine0/geomacro" &&
    b?.production_activation_performed===false &&
    report.deployed_sha===expected;
  // Still perform harmless read-only GET diagnostics against a stale live site,
  // but never interpret them as Phase 1 acceptance or issue query POSTs.
  if(!report.exact_sha_verified){
    failed=true;
    report.error="PRODUCTION_EXACT_SHA_NOT_CONFIRMED";
  }

  const canonical=await json(base+"/api/v1/intelligence/query");
  report.canonical_get={http:canonical.http,
    route_present:canonical.http===200 ||
      (canonical.http===503 && canonical.body?.configured===false)};
  if(!report.canonical_get.route_present)failed=true;
  for(const category of ["geopolitics","macro-fx","critical-minerals"]){
    try {
      const r=await json(base+"/api/v1/intelligence/"+category+"?view=latest");
      report.category_gets.push({
        category,http:r.http,
        contract_valid:r.http===200 &&
          r.body?.schema_version==="geomacro.category-live-official-observation.v1" &&
          r.body?.category===category &&
          r.body?.x402_payment_required===false &&
          r.body?.signed_gro_generated===false,
        observation_status:typeof r.body?.status==="string"?r.body.status:null,
      });
    }catch{
      report.category_gets.push({category,http:0,contract_valid:false,observation_status:null});
    }
  }
  if(report.category_gets.some(x=>!x.contract_valid))failed=true;
  if(report.exact_sha_verified) for(let i=0;i<cases.length;i++){
    if(i>0)await delay(65_000); // honour the existing per-client 2/min provider budget
    const x=cases[i];
    try{
      const r=await json(base+"/api/v1/intelligence/query",{
        method:"POST",body:JSON.stringify({
          question:x.question,
          subjects:[{type:"country",country_iso3:x.country}],
          topics:[x.topic],max_age_seconds:x.age,
          fulfillment_mode:"live_on_demand",
          detail:"compact",
        }),
      });
      const body=r.body;
      const noFunds=r.http!==402 && body?.chargeable===false &&
        body?.payment_required_now===false &&
        body?.execution_authorized===false &&
        !body?.payment && !body?.accepts;
      const contract=(r.http===200 &&
        body?.response_kind==="NO_CHARGE_RESEARCH_EVIDENCE_STATUS" &&
        body?.historical_baseline_verified_in_this_response===false &&
        body?.on_demand?.verified_signed_current_event_count===0) ||
        (r.http===422 && body?.error?.code==="ON_DEMAND_VERIFICATION_PENDING") ||
        (r.http===429 && body?.error?.code==="ON_DEMAND_PROVIDER_BUDGET_RATE_LIMITED");
      const isFed=x.id.startsWith("USA_FED_");
      const verifiedBoundDraft=body?.on_demand?.private_exact_query_bound_fed_drafts===1 &&
        body?.on_demand?.private_source_bound_structured_finding_candidates===1 &&
        body?.on_demand?.article_page_publication_dates_verified>=1;
      // This is an exact, real customer POST. A 422 never becomes signing
      // eligibility; an actual source-backed draft is proved only when the
      // existing private canonical engine reports a verified match.
      const fedExactClaimAccepted=!isFed ||
        (x.age>86400 ? verifiedBoundDraft :
          body?.on_demand?.private_exact_query_bound_fed_drafts===0);
      const summarized={
        id:x.id,http:r.http,code:body?.error?.code??null,
        provider_attempts:typeof body?.on_demand?.network_attempts==="number"
          ?body.on_demand.network_attempts:null,
        original_page_checks:typeof body?.on_demand?.original_article_page_checks==="number"
          ?body.on_demand.original_article_page_checks:null,
        qualification_status:body?.on_demand?.private_evidence_qualification?.status??null,
        historical_query_draft_verified:isFed&&x.age>86400?verifiedBoundDraft:null,
        historical_original_rejected_by_current_scope:isFed&&x.age===86400?
          body?.on_demand?.private_exact_query_bound_fed_drafts===0:null,
        no_payment:noFunds,contract_valid:contract,
        is_history:x.age>86400,
      };
      report.cases.push(summarized);
      if(!noFunds || !contract || !fedExactClaimAccepted)failed=true;
    }catch{
      report.cases.push({id:x.id,http:0,code:"TRANSPORT_UNAVAILABLE",
        provider_attempts:null,original_page_checks:null,
        qualification_status:null,no_payment:false,contract_valid:false,
        is_history:x.age>86400});
      failed=true;
    }
  }
}catch(error){
  failed=true;
  report.error=error instanceof Error?error.message:"PRODUCTION_PROBE_FAILED";
}
report.production_crosscheck_passed=!failed &&
  report.exact_sha_verified && report.cases.length===cases.length &&
  report.category_gets.length===3;
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/production-phase2-read-only.json",
  JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report));
if(!report.production_crosscheck_passed)process.exitCode=3;
