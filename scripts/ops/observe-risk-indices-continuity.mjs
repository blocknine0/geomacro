#!/usr/bin/env node
/**
 * Always-on no-funds certified index observability, piggybacking the
 * EXISTING half-hour guarded repair job (no additional cron).
 *
 * This NEVER signs a GRI, waives independent reviewer approval, recomputes
 * numerical values or changes the locked Risk Indices page.
 */
import {appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {assertVerifiedCurrentGlobalRiskD1Parent} from "../lib/risk-indices-verified-d1-parent.mjs";
import {prepareGriSignedReadyCadenceHint} from "../lib/gri-signed-ready-cadence-hint.mjs";
import {verifyRiskIndicesLiveContinuity} from "./verify-risk-indices-live-continuity.mjs";

const GRI="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/global-risk";
const FAIL=(code)=>{throw Error("INDICES_CONTINUITY_WATCH_"+code)};
async function publicParent(fetchImpl){
 let response;
 try{
  response=await fetchImpl(GRI,{method:"GET",redirect:"error",cache:"no-store",
   headers:{accept:"application/json","cache-control":"no-cache"},
   signal:AbortSignal.timeout(12000)});
 }catch{return {state:"PARENT_HTTP_UNAVAILABLE",snapshot:null};}
 if(response.redirected||response.status!==200)return {state:"PARENT_HTTP_UNAVAILABLE",snapshot:null};
 try{
  const body=await response.text();
  if(body.length>800000)return {state:"PARENT_ENVELOPE_INVALID",snapshot:null};
  return {state:"PARENT_READ",snapshot:JSON.parse(body)};
 }catch{return {state:"PARENT_ENVELOPE_INVALID",snapshot:null};}
}
export async function observeRiskIndicesContinuity({
 fetchImpl=fetch,env=process.env,now=Date.now(),verifier=verifyRiskIndicesLiveContinuity,
}={}){
 if(!Number.isFinite(now)||!env)FAIL("INVALID_ENV_OR_CLOCK");
 const hints=prepareGriSignedReadyCadenceHint({
  reviewedSha:env.GRI_READY_REVIEWED_SHA256,
  certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,
  readyAt:env.GRI_READY_APPROVED_AT,now:new Date(now)
 });
 const parent=await publicParent(fetchImpl);
 let signedParent=false;
 if(parent.snapshot){
  try{assertVerifiedCurrentGlobalRiskD1Parent(parent.snapshot,now);signedParent=true;}catch{}
 }
 // Attempt same exact public D1/Edge readback even if GRI parent hot has
 // expired: could catch a genuinely published child that hasn't yet expired.
 let liveVerified=false;
 try{
  const proof=await verifier({fetchImpl,now});
  liveVerified=proof.ok===true&&proof.three_independent_indices_verified===true&&
   proof.edge_readback_verified===true&&proof.d1_readback_verified===true;
 }catch{}
 const status=liveVerified?"CURRENT_SIGNED_THREE_INDICES_VERIFIED":
  signedParent?"CURRENT_SIGNED_PARENT_INDICES_DELIVERY_NOT_VERIFIED":
  parent.state==="PARENT_HTTP_UNAVAILABLE"?"PARENT_HTTP_UNAVAILABLE":
  "NO_CURRENT_SIGNED_GRI_PARENT";
 return Object.freeze({
  schema:"geomacro.risk-indices-continuous-watchdog.v1",
  status,current_signed_numerical_parent_verified:signedParent,
  current_three_indices_public_d1_edge_verified:liveVerified,
  genuine_reviewed_input_pointer_present:hints.eligible,
  reviewed_input_pointer_status:hints.reason,
  safe_operational_action:liveVerified?"NONE":
   signedParent?"EXISTING_GUARDED_INDICES_REPAIR_AND_EDGE_ACCEPTANCE":
   "AWAIT_GENUINE_SIGNED_REVIEW_AND_COUNTRY_CERTIFICATES",
  source_or_signer_material_logged:false,
  private_news_exposed:false,
  d1_writes:0,b2_direct_requests:0,supabase_requests:0,payments:0,
 });
}
export function safeIndicesWatchSummary(r){
 if(r?.schema!=="geomacro.risk-indices-continuous-watchdog.v1")FAIL("INVALID_RECEIPT");
 const statuses=new Set([
  "CURRENT_SIGNED_THREE_INDICES_VERIFIED",
  "CURRENT_SIGNED_PARENT_INDICES_DELIVERY_NOT_VERIFIED",
  "PARENT_HTTP_UNAVAILABLE","NO_CURRENT_SIGNED_GRI_PARENT",
 ]);
 if(!statuses.has(r.status))FAIL("UNSAFE_STATUS");
 return ["### Risk Indices — continuously verified numerical delivery",
  "","**"+r.status+"**","",
  "Independently signed current GRI parent: "+(r.current_signed_numerical_parent_verified?"YES":"NOT VERIFIED"),
  "Three exact signed indices at public D1 + Edge: "+(r.current_three_indices_public_d1_edge_verified?"YES":"NOT VERIFIED"),
  "Already approved source/certificate pointer eligible: "+(r.genuine_reviewed_input_pointer_present?"PRESENT (signature validation pending)":"NOT VERIFIED"),
  "Next action: "+r.safe_operational_action,
  "","No scores/signatures/source details printed, no new rights, USDC, B2 direct GET or D1 write.",
  "A green scheduler run means the watcher executed, not that current GRI is available.",
  ""].join("\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const r=await observeRiskIndicesContinuity();
  console.log(JSON.stringify(r));
  if(process.env.GITHUB_STEP_SUMMARY)
   appendFileSync(process.env.GITHUB_STEP_SUMMARY,safeIndicesWatchSummary(r));
  // A current, genuine parent with missing public numerical delivery is an
  // actionable production regression. Missing external certification stays
  // accurately blocked but does not cause unbounded scheduled retry storms.
  if(r.status==="CURRENT_SIGNED_PARENT_INDICES_DELIVERY_NOT_VERIFIED"){
   console.error("::error::CURRENT_SIGNED_GRI_INDICES_PUBLIC_DELIVERY_FAILED");
   process.exitCode=1;
  }
 }catch(e){
  console.error("INDICES_CONTINUITY_WATCH_FAILED_CLOSED");
  process.exitCode=2;
 }
}
