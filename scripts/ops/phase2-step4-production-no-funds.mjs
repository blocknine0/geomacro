#!/usr/bin/env node
/** Phase 2 Step 4: exact SAME request for zero-money structural preflight and
 * canonical query on LIVE HTTPS. No signature header, wallet or settlement.
 * This is a diagnostic, not an entitlement or fake signed product. */
import { createHash } from "node:crypto";
import { mkdirSync,writeFileSync } from "node:fs";

const base="https://geomacro.live";
const expected="a7fb150c6b78c32a44a33c49b72a43e09c90c242";
const request={
  question:"China CPI inflation annual structural baseline",
  subjects:[{type:"country",country_iso3:"CHN"}],
  topics:["macro_risk"],fulfillment_mode:"published_only",
  delivery_tier:"structural_baseline",max_age_seconds:400*86400,
  detail:"compact",
};
const digest=createHash("sha256").update(JSON.stringify(request)).digest("hex");
const http=async(path,body)=>{
  const res=await fetch(base+path,{
    method:body?"POST":"GET",redirect:"error",
    cache:"no-store",signal:AbortSignal.timeout(30_000),
    headers:{"accept":"application/json","content-type":"application/json",
      "cache-control":"no-cache"},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const raw=await res.text();
  if(raw.length>60_000)throw Error("STEP4_PRODUCTION_RESPONSE_TOO_LARGE");
  let json=null;try{json=JSON.parse(raw);}catch{}
  return {status:res.status,body:json};
};
const report={
  schema:"geomacro.phase2-step4-production-same-request-no-funds.v1",
  checked_at:new Date().toISOString(),
  expected_sha:expected,deployed_sha:null,exact_sha_verified:false,
  request_digest_sha256:digest,
  preflight:null,canonical:null,
  payment_signature_sent:false,payment_settlement_attempted:false,
  zero_money_boundary_passed:false,commercially_eligible:false,
};
try {
  const build=await http("/.well-known/geomacro-build.json");
  report.deployed_sha=build.body?.canonical_main_sha??null;
  report.exact_sha_verified=build.status===200 &&
    build.body?.schema_version==="geomacro.deployment-build.v1" &&
    build.body?.canonical_repository==="blocknine0/geomacro" &&
    report.deployed_sha===expected &&
    build.body?.production_activation_performed===false;
  if(!report.exact_sha_verified)throw Error("LIVE_STEP4_BASE_SHA_MISMATCH");
  // No payment header means neither endpoint can legitimately settle.
  const preflight=await http("/api/v1/intelligence/availability",request);
  const query=await http("/api/v1/intelligence/query",request);
  const safe=r=>({http:r.status,code:r.body?.error?.code??null,
    status:r.body?.status??null,chargeable:r.body?.chargeable??null,
    payment_required_now:r.body?.payment_required_now??null,
    execution_authorized:r.body?.execution_authorized??null,
    delivery_tier:r.body?.delivery_tier??null});
  report.preflight=safe(preflight);report.canonical=safe(query);
  const preflightPositive=preflight.status===200 && preflight.body?.ok===true &&
    preflight.body?.status?.startsWith("ELIGIBLE_");
  const invalidCharge=query.status===402 && !preflightPositive;
  const noFunds=[preflight,query].every(r=>r.status!==200||
    r.body?.execution_authorized!==true) &&
    preflight.status!==402 &&
    !invalidCharge &&
    !query.body?.payment?.settlement_reference;
  report.zero_money_boundary_passed=noFunds;
  report.commercially_eligible=preflightPositive && query.status===402 &&
    typeof query.body?.extensions?.geomacro?.info?.query_plan_hash==="string";
  if(!noFunds)throw Error("STEP4_PREMATURE_QUOTE_OR_PAYMENT_BOUNDARY");
} catch(e){
  report.error=e instanceof Error?e.message:"STEP4_HTTPS_UNAVAILABLE";
}
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/step4-production-no-funds.json",
  JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report));
if(!report.zero_money_boundary_passed)process.exitCode=3;
