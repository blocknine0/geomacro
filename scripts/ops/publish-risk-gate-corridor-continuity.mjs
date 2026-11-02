#!/usr/bin/env node
/** Continuous canonical D1 five-corridor watch; separate private JIT proof.
 * Never calls paid, signed GRO or PREDGE code.
 */
import {createHmac} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {TRACKED_CORRIDORS} from "../../lib/risk-gate-corridor-first.mjs";
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev";
export async function publishContinuousStrategicCorridors({
 rootToken,fetchImpl=fetch,endpoint=ENDPOINT
}={}){
 if(typeof rootToken!=="string"||rootToken.trim().length<32||
   typeof fetchImpl!=="function"||endpoint!==ENDPOINT)
  throw Error("RG_STRATEGIC_RUN_INPUT_INVALID");
 const auth="Bearer "+createHmac("sha256",rootToken.trim())
  .update("geomacro-control-plane-v1").digest("hex");
 let response;
 for(let attempt=0;attempt<5;attempt++){
  try{
   response=await fetchImpl(endpoint+"/v1/internal/risk-gate/corridor-first-tick",{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{Authorization:auth},signal:AbortSignal.timeout(15000)
   });
  }catch{throw Error("RG_STRATEGIC_NETWORK_UNAVAILABLE")}
  if(response.status===200)break;
  if(![404,503].includes(response.status)||attempt===4)
   throw Error("RG_STRATEGIC_TICK_HTTP_"+response.status);
  await new Promise(resolve=>setTimeout(resolve,5000*(attempt+1)));
 }
 let tick;try{tick=await response.json()}catch{throw Error("RG_STRATEGIC_TICK_INVALID")}
 if(tick.ok!==true||tick.schema!=="geomacro.risk-gate-corridor-first-receipt.v1"||
  tick.strategic_corridors_monitored!==5||tick.canonical_d1_readback!==true||
  !Array.isArray(tick.source_reference_counts)||tick.source_reference_counts.length!==5||
  tick.verified_real_world_events!==0||tick.signed_gro_generated!==false||
  tick.paid_quote_enabled!==false||tick.customer_credits_debited!==0||
  tick.execution_authorized!==false||tick.chargeable!==false||
  tick.predge_writes!==0||tick.website_intelligence_writes!==0)
  throw Error("RG_STRATEGIC_D1_ACCEPTANCE_INVALID");
 const proven=[];
 for(const corridor of TRACKED_CORRIDORS){
  const params=new URLSearchParams({subject_type:"corridor",subject_id:corridor.id});
  const res=await fetchImpl(endpoint+"/v1/internal/risk-gate/jit?"+params,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:auth},signal:AbortSignal.timeout(15000)
  });
  if(res.status!==200)throw Error("RG_STRATEGIC_JIT_HTTP_"+res.status);
  let value;try{value=await res.json()}catch{throw Error("RG_STRATEGIC_JIT_INVALID")}
  if(value.ok!==true||value.schema!=="geomacro.risk-gate-jit-preflight.v1"||
   value.processing_tier!=="STRATEGIC_CONTINUOUS"||
   value.subject?.id!==corridor.id||value.same_event_verified!==false||
   value.signed_gro!==null||value.risk_gate_decision!==null||
   value.customer_credits_debited!==0||value.chargeable!==false||
   value.execution_authorized!==false)
   throw Error("RG_STRATEGIC_JIT_BOUNDARY_INVALID");
  const expected=tick.source_reference_counts.find(x=>x.corridor_id===corridor.id);
  // JIT runs seconds after tick and may acquire new evidence on a busy
  // system. Require healthy non-negative counts; no fabricated event match.
  if(!expected||!Number.isInteger(value.candidate_count)||value.candidate_count<0||
    !Number.isInteger(value.potential_corroboration_pairs)||
    value.potential_corroboration_pairs<0)
   throw Error("RG_STRATEGIC_JIT_COUNTS_INVALID");
  proven.push({corridor_id:corridor.id,candidate_count:value.candidate_count,
   potential_corroboration_pairs:value.potential_corroboration_pairs,
   signed_gro_generated:false});
 }
 const country=await fetchImpl(endpoint+
  "/v1/internal/risk-gate/jit?subject_type=country&subject_id=USA",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:auth},signal:AbortSignal.timeout(15000)
  });
 if(country.status!==202)throw Error("RG_LONGTAIL_JIT_FAIL_CLOSED_INVALID");
 const unverified=await country.json();
 if(unverified.processing_tier!=="JIT_REQUEST_ONLY"||
  !["COUNTRY_SPECIFIC_VERIFIED_EVIDENCE_REQUIRED",
    "ORIGINAL_HEADLINE_COUNTRY_CANDIDATES_UNVERIFIED"].includes(unverified.verification_status)||
  (unverified.discovery_evidence_count??0)<0||
  unverified.customer_credits_debited!==0||unverified.chargeable!==false||
  unverified.signed_gro!==null||unverified.risk_gate_decision!==null)
  throw Error("RG_LONGTAIL_JIT_NO_CHARGE_INVALID");
 return {
  schema:"geomacro.risk-gate-continuity-production-acceptance.v1",
  checked_at:new Date().toISOString(),continuous_corridors:5,
  source_d1_write_readback:true,strategic_jit_live_verified:5,
  longtail_jit_fail_closed_no_charge:true,
  corridors:proven,verified_events:0,signed_gro_generated:false,
  paid_gate_enabled:false,credits_debited:0,chargeable:false,
  execution_authorized:false,predge_writes:0
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
   throw Error("RG_STRATEGIC_MAIN_ONLY");
  // We only poll the private D1 AFTER original D1 ingest and readback; the
  // source receipt is a required proof that main completed source discovery.
  const source=JSON.parse(readFileSync("artifacts/direct-corridor-intake/receipt.json","utf8"));
  if(source.channel!=="CORRIDOR_ONLY"||source.source_count!==37)
   throw Error("RG_STRATEGIC_SOURCE_RECEIPT_INVALID");
  const result=await publishContinuousStrategicCorridors({
   rootToken:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN
  });
  writeFileSync("artifacts/direct-corridor-intake/risk-gate-corridor-continuity.json",
   JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
 }catch(e){console.error("::error::"+String(e?.message??"RG_STRATEGIC_UNKNOWN").slice(0,120));
  process.exitCode=2}
}
