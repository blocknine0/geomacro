#!/usr/bin/env node
/**
 * Read-only no-funds diagnostic. Reports four DIFFERENT GRI eligibility
 * gates; never equates a news candidate or SHA hint with signed commercial
 * review, and never runs the scorer/publisher.
 */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {prepareGriSignedReadyCadenceHint} from "../lib/gri-signed-ready-cadence-hint.mjs";
import {assertVerifiedCurrentGlobalRiskD1Parent} from "../lib/risk-indices-verified-d1-parent.mjs";
import {classifyRiskIndicesRepair} from "./risk-indices-verified-parent-backstop.mjs";

const HOST="https://geomacro-control-plane.daspallab202391.workers.dev";
const CATS=["geopolitics","macro","rare_earth"];
const MAX_BYTES=900_000;
const FAIL=(s)=>{throw Error("GRI_FOUR_GATE_"+s)};

function acceptWorklist(w,now){
  if(!w||w.schema!=="geomacro.material-gri-country-evidence-worklist.v1"||
     w.canonical_country_registry_count!==195||
     w.trigger_only_after_verified_signed_inputs!==true||
     w.real_signed_gri_scoring_permission_inferred!==false||
     w.numerical_gri_recomputed!==false||
     w.signed_gri_or_country_certificate_created!==false||
     w.original_content_or_urls_included!==false||
     w.public_gri_or_indices_written!==false||
     !Array.isArray(w.categories)||w.categories.length!==3||
     w.categories.some((c,i)=>c?.category!==CATS[i]||
       !Array.isArray(c.review_targets)||c.review_targets.length>25||
       c.within_90m_new_gri_window!==c.review_targets.filter(t=>t.candidate_within_90m_new_gri_window===true).length||
       c.within_90m_and_country_mapped!==c.review_targets.filter(t=>
         t.candidate_within_90m_new_gri_window===true&&t.country_iso3!==null).length))
    FAIL("AUTHENTIC_UNSCORED_WORKLIST_REQUIRED");
  const created=Date.parse(w.generated_at),ms=now.getTime();
  if(!Number.isFinite(ms)||!Number.isFinite(created)||created>ms+60_000||
     ms-created>15*60_000)FAIL("WORKLIST_STALE_OR_FUTURE");
  const n=w.categories.reduce((sum,c)=>sum+c.within_90m_new_gri_window,0);
  const mapped=w.categories.reduce((sum,c)=>sum+c.within_90m_and_country_mapped,0);
  if(w.current_native_original_90m_review_targets!==n||
     w.current_native_original_90m_country_mapped_targets!==mapped)
    FAIL("SOURCE_WINDOW_COUNTS_MISMATCH");
  return {n,mapped};
}

async function boundedPublicD1(product,fetchImpl){
  let response;
  try{response=await fetchImpl(HOST+"/v1/public/hot-snapshot/"+product,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{accept:"application/json","cache-control":"no-cache"},
    signal:AbortSignal.timeout(12000),
  });}catch{return null;}
  if(!response||response.status!==200||response.redirected)return null;
  if((response.headers?.get?.("content-type")??"").startsWith("text/"))return null;
  try{
    const body=await response.text();
    if(body.length<40||body.length>MAX_BYTES)return null;
    return JSON.parse(body);
  }catch{return null;}
}

export async function reportGriFourGates({
  worklist,env=process.env,now=new Date(),fetchImpl=fetch,
}={}){
  const source=acceptWorklist(worklist,now);
  const hint=prepareGriSignedReadyCadenceHint({
    reviewedSha:env.GRI_READY_REVIEWED_SHA256,
    certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,
    readyAt:env.GRI_READY_APPROVED_AT,now,
  });
  const gri=await boundedPublicD1("global-risk",fetchImpl);
  let verifiedParent=null;
  try{verifiedParent=assertVerifiedCurrentGlobalRiskD1Parent(gri,now.getTime());}
  catch{/* no signed live GRI is NOT zero real-world risk */}
  const child=verifiedParent?
    await boundedPublicD1("risk-indices",fetchImpl):null;
  const indices=verifiedParent?
    classifyRiskIndicesRepair({griSnapshot:gri,indicesSnapshot:child,now:now.getTime()}):
    null;
  const indicesCurrent=indices?.status==="CURRENT_INDICES_ALREADY_MATCH_PARENT";
  // Output only counts and provenance status; no raw news, source identity,
  // owner licence metadata, B2 keys, GRI values, Github token or URLs.
  return Object.freeze({
    schema:"geomacro.gri-four-gate-source-and-product-readiness.v1",
    checked_at:now.toISOString(),
    genuine_native_90m_review_candidates:source.n,
    country_mapped_native_90m_review_candidates:source.mapped,
    original_bytes_rights_and_independent_signatures_verified_in_this_job:false,
    approved_signed_gri_pointer_hints_present:hint.eligible,
    approved_signed_pointer_hint_status:hint.eligible?
      "HINTS_PRESENT_PRIVATE_B2_SIGNATURES_MUST_BE_RECHECKED":hint.reason,
    real_reviewed_gri_input_verified_in_this_job:false,
    current_numerical_gri_v12_product_verified:verifiedParent!==null,
    current_risk_indices_exact_parent_verified:indicesCurrent,
    risk_indices_repair_eligible:indices?.eligible===true,
    numerical_recomputation_performed_in_this_job:false,
    country_certificates_issued_in_this_job:false,
    paid_delivery_authorized:false,
    raw_source_exposed:false,
    supabase_requests:0,b2_requests:0,d1_writes:0,payments:0,
    unresolved_gates:Object.freeze([
      ...(source.mapped===0?["CURRENT_90M_COUNTRY_MAPPED_ORIGINAL_MISSING"]:[]),
      ...(!hint.eligible?["INDEPENDENTLY_APPROVED_SIGNED_GRI_INPUT_POINTERS_MISSING"]:[]),
      ...(!verifiedParent?["ACTUAL_SIGNED_GRI_V12_NUMERICAL_PUBLICATION_UNVERIFIED"]:[]),
      ...(!indicesCurrent?["RISK_INDICES_SIGNED_PARENT_PUBLICATION_UNVERIFIED"]:[]),
    ]),
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const input=JSON.parse(readFileSync(
      "artifacts/derived-news/material-gri-country-evidence-worklist.json","utf8"));
    const data=await reportGriFourGates({worklist:input});
    mkdirSync("artifacts/derived-news",{recursive:true});
    writeFileSync("artifacts/derived-news/gri-four-gates-readiness.json",
      JSON.stringify(data,null,2),{mode:0o600});
    console.log(JSON.stringify(data));
    if(process.env.GITHUB_STEP_SUMMARY){
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        "### GRI v1.2 four independent gates (no funds)\n"+
        "| Gate | Verified result |\n|---|---|\n"+
        "| Last 90m first-party review candidates (not verified events) | "+data.genuine_native_90m_review_candidates+" |\n"+
        "| Country-mapped candidate count | "+data.country_mapped_native_90m_review_candidates+" |\n"+
        "| Signed B2 pointer **hints** (not actual signatures) | "+data.approved_signed_gri_pointer_hints_present+" |\n"+
        "| Actual current D1/B2-verified numerical GRI | "+data.current_numerical_gri_v12_product_verified+" |\n"+
        "| Current Risk Indices exact verified GRI parent | "+data.current_risk_indices_exact_parent_verified+" |\n"+
        "\nUnsigned review material is NEVER promoted into a paid GRI or Risk Indices product.\n");
    }
  }catch{
    console.error("GRI_FOUR_GATE_READINESS_REPORT_FAILED_CLOSED");
    process.exitCode=2;
  }
}
