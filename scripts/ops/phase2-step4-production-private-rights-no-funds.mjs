#!/usr/bin/env node
/**
 * Exactly ONE genuine production discovery request through the existing
 * private B2 rights reader. This script has NO Cloudflare/B2 secrets.
 * The server performs any rights GET only after its OWN D1 governor reserves
 * the account-wide ticket. Never fetch the B2 object or rights JSON here.
 * Not a paid quote, signer acceptance, or licence authorisation.
 */
import { mkdirSync,writeFileSync } from "node:fs";
const ROOT="https://geomacro.live";
const EXPECTED="a7fb150c6b78c32a44a33c49b72a43e09c90c242";
const MAX_BYTES=60_000;
const safeStatus=new Set([
  "NO_ANNUAL_EVIDENCE","UNVERIFIED_ANNUAL_EVIDENCE",
  "RIGHTS_RECEIPT_UNAVAILABLE","SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE",
  "ATTRIBUTION_NOT_SUPPORTED_BY_PRIVATE_OUTPUT",
  "DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT",
]);
const report={
  schema:"geomacro.phase2-step4-production-private-rights-no-funds.v1",
  checked_at:new Date().toISOString(),
  deployed_sha:null,exact_sha_verified:false,query_http:null,
  provider_error:null,private_macro_rights_status:null,
  annual_driver_count:null,rights_verified_driver_count:null,
  private_rights_success_proven:false,protected_read_prerequisite_verifiable:false,
  payment_signature_sent:false,quote_accepted:false,settlement_attempted:false,
  raw_source_published:false,production_mutation_performed:false,
};
const read=async(url,init)=>{
  const res=await fetch(url,{...init,redirect:"error",cache:"no-store",
    headers:{"accept":"application/json","content-type":"application/json","cache-control":"no-cache"},
    signal:AbortSignal.timeout(30_000)});
  const body=await res.text();
  if(body.length>MAX_BYTES)throw Error("RESPONSE_TOO_LARGE");
  let data=null;try{data=JSON.parse(body);}catch{}
  return {http:res.status,data};
};
try {
  const b=await read(ROOT+"/.well-known/geomacro-build.json");
  report.deployed_sha=typeof b.data?.canonical_main_sha==="string"?b.data.canonical_main_sha:null;
  report.exact_sha_verified=b.http===200&&b.data?.schema_version==="geomacro.deployment-build.v1"&&report.deployed_sha===EXPECTED;
  if(!report.exact_sha_verified)throw Error("EXACT_DEPLOYMENT_SHA_UNVERIFIED");
  const result=await read(ROOT+"/api/v1/intelligence/query",{
    method:"POST",body:JSON.stringify({
      question:"China macroeconomic announcements in the past 7 days",
      subjects:[{type:"country",country_iso3:"CHN"}],
      topics:["macro_risk"],max_age_seconds:7*86400,
      fulfillment_mode:"live_on_demand",detail:"compact",
    }),
  });
  report.query_http=result.http;
  report.provider_error=typeof result.data?.error?.code==="string"
    ?result.data.error.code.slice(0,90):null;
  const discovery=result.data?.on_demand;
  const rightsStatus=discovery?.private_annual_macro_rights_status;
  report.private_macro_rights_status=safeStatus.has(rightsStatus)?rightsStatus:null;
  report.annual_driver_count=Number.isInteger(discovery?.private_annual_directional_macro_driver_count)
    ?discovery.private_annual_directional_macro_driver_count:null;
  report.rights_verified_driver_count=Number.isInteger(discovery?.private_annual_macro_rights_verified_driver_count)
    ?discovery.private_annual_macro_rights_verified_driver_count:null;
  const noFunds=result.http===422&&result.data?.chargeable===false&&
    result.data?.payment_required_now===false &&
    result.data?.execution_authorized===false&&!result.data?.payment;
  // This is a server's aggregated rights-policy read, not an independent
  // B2 receipt verifier or evidence of a specific quota reservation.
  report.private_rights_success_proven=noFunds &&
    rightsStatus==="DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT" &&
    report.rights_verified_driver_count>0;
  report.protected_read_prerequisite_verifiable=report.annual_driver_count>0;
  report.no_funds_contract_valid=noFunds;
  if(!noFunds)throw Error("NO_FUNDS_DISCOVERY_BOUNDARY_NOT_VERIFIED");
}catch(e){
  report.diagnostic_error=e instanceof Error?e.message:"PRODUCTION_REQUEST_FAILED";
}
mkdirSync("artifacts/on-demand-live",{recursive:true});
writeFileSync("artifacts/on-demand-live/step4-private-rights-no-funds.json",
  JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report));
if(!report.no_funds_contract_valid)process.exitCode=3;
