#!/usr/bin/env node
/**
 * #1827: independent x402 FAIL-CLOSED proof after exact-main Production
 * Website Health fails. This has NO secrets, coin-wallet operations, payment
 * signature/header, x402 execution request, B2, Supabase, or D1 write.
 *
 * Unlike "verify" (appropriately skipped until production is healthy), this
 * emits a sanitized negative launch receipt and deliberately returns RED.
 * A healthy status cannot be promoted to commerce by this diagnostic.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { fetchBoundedNoFunds } from "../agentic/bounded-live-x402-no-funds-fetch.mjs";

const BASE="https://geomacro.live";
const SAFE_DENIAL=new Set([
  "NOT_AVAILABLE","INSUFFICIENT_COVERAGE",
  "COMMERCIAL_SOURCE_NOT_ELIGIBLE","STALE_REQUIRED_DATA",
]);
const FIELDS=["intelligence","global_risk","risk_indices"];

async function strictPublicJson(path,{fetchImpl,method="GET",body=null}={}) {
  const url=new URL(path,BASE);
  const allowed=new Map([
    ["/api/health?deep=1","GET"],
    ["/.well-known/x402.json","GET"],
    ["/api/x402/risk/availability","POST"],
  ]);
  if(url.origin!==BASE || allowed.get(url.pathname+url.search)!==method ||
    typeof fetchImpl!=="function")throw Error("X402_FAILED_HEALTH_REQUEST_INVALID");
  let response;
  try{
    if(path==="/api/health?deep=1"){
      response=await fetchImpl(url.href,{
        method:"GET",redirect:"error",
        headers:{Accept:"application/json"},
        signal:AbortSignal.timeout(8_000),
      });
    }else{
      response=await fetchBoundedNoFunds(url.href,{
        method,redirect:"error",
        headers:method==="POST"?{"content-type":"application/json",accept:"application/json"}:
          {accept:"application/json"},
        ...(body?{body:JSON.stringify(body)}:{}),
      },{fetchImpl,sleep:async()=>{}});
    }
  }catch{
    return {http_status:0,payload:null};
  }
  const http_status=Number.isInteger(response?.status)?response.status:0;
  try{
    const raw=await response.text();
    if(raw.length>80_000) return {http_status,payload:null};
    const payload=JSON.parse(raw);
    return {http_status,payload:payload && typeof payload==="object" &&
      !Array.isArray(payload)?payload:null};
  }catch{return {http_status,payload:null};}
}

export async function diagnoseFailedX402MainHealth({
  fetchImpl=fetch,nowMs=Date.now(),
}={}){
  if(!Number.isFinite(nowMs))throw Error("X402_FAILED_HEALTH_TIME_INVALID");
  // fixed-country, fixed-schema, quote/availability ONLY: no payment headers,
  // no token, no blockchain signature, no paid execution endpoint.
  const body={
    schema_version:"geomacro.agent-query.v1",
    subjects:[{type:"country",country_iso3:"USA"}],
    topics:["risk_object"],evidence:"required",detail:"compact",
  };
  const [health,discovery,availability]=await Promise.all([
    strictPublicJson("/api/health?deep=1",{fetchImpl}),
    strictPublicJson("/.well-known/x402.json",{fetchImpl}),
    strictPublicJson("/api/x402/risk/availability",{fetchImpl,method:"POST",body}),
  ]);
  const live=health.payload?.public_production?.hot_snapshot_serving;
  const hotProofs=Object.fromEntries(FIELDS.map(n=>[n,live?.[n]?.ok===true]));
  const actualHot=FIELDS.every(n=>hotProofs[n]);
  const configured=health.payload?.production_data_runtime_configured===true;
  const exactNoFundsDiscovery=discovery.http_status===200 &&
    discovery.payload?.status==="prelaunch" &&
    discovery.payload?.productionFundsAuthorized===false &&
    Array.isArray(discovery.payload?.resources)&&
    discovery.payload.resources.length===0;
  const a=availability.payload;
  const code=String(a?.availability?.code??"");
  const denied=availability.http_status===422 && a?.ok!==true &&
    a?.availability?.deliverable===false &&
    a?.payment_required_now===false &&
    a?.execution_authorized===false &&
    a?.chargeable!==true &&
    SAFE_DENIAL.has(code);
  const gateSafe=exactNoFundsDiscovery && denied &&
    !actualHot && health.http_status===503 &&
    health.payload?.ok===false &&
    configured && health.payload?.x402?.state==="controlled_prelaunch";
  const receipt={
    schema:"geomacro.x402-failed-production-health-no-funds.v1",
    checked_at:new Date(nowMs).toISOString(),
    public_host:"geomacro.live",
    health_http_status:health.http_status,
    discovery_http_status:discovery.http_status,
    availability_http_status:availability.http_status,
    data_runtime_configured:configured,
    hot_snapshot_verified:hotProofs,
    all_current_hot_products_verified:actualHot,
    discovery_prelaunch_no_resources:exactNoFundsDiscovery,
    availability_denial_code:SAFE_DENIAL.has(code)?code:null,
    availability_safe_no_charge:denied,
    negative_safety_boundary_verified:gateSafe,
    independent_commercial_acceptance:false,
    live_x402_prod_earning_authorized:false,
    external_payment_executed:false,
    real_funds_touched:false,
    raw_news_or_source_exposed:false,
    source_urls_returned:false,
    upstream_payloads_logged:false,
    b2_requests:0,supabase_reads:0,supabase_writes:0,
    d1_writes:0,model_calls:0,
  };
  return receipt;
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const report=await diagnoseFailedX402MainHealth();
    mkdirSync("artifacts/x402",{recursive:true});
    writeFileSync("artifacts/x402/failed-health-no-funds.json",
      JSON.stringify(report,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(report));
    if(!report.negative_safety_boundary_verified)
      console.error("::error::X402_FAILED_HEALTH_NO_FUNDS_SAFETY_NOT_VERIFIED");
    else
      console.error("::error::X402_COMMERCIAL_LAUNCH_BLOCKED_BY_STALE_PUBLIC_DATA");
    // This is a NEGATIVE commercial acceptance receipt, always RED.
    process.exitCode=3;
  }catch{
    console.error("::error::X402_FAILED_HEALTH_DIAGNOSTIC_NOT_VERIFIED");
    process.exitCode=3;
  }
}
