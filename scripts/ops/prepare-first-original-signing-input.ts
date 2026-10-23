#!/usr/bin/env bun
import {ORIGINAL_VERIFICATION_WINDOW_SECONDS} from "../../src/lib/original-verification-policy";
/**
 * Bounded first-party signing PREPARATION, not signing. No credentials or
 * source-rights license presumed; original URLs/titles remain process-private.
 * GitHub runs preserve ONLY an aggregate redacted receipt. A custodian may
 * explicitly save private leads on their own protected filesystem.
 */
import {createHash} from "node:crypto";
import {existsSync,lstatSync,mkdirSync,realpathSync,writeFileSync} from "node:fs";
import {isAbsolute,relative,resolve,sep} from "node:path";
import {COUNTRIES_195,country195ByIso3} from "../../src/lib/canonical-country-registry-195";
import {discoverDirectPublisherForPrivateQualification,
 verifyOnDemandOriginalArticlePages} from "../../src/lib/on-demand-global-discovery.server";
import {verifyGeomacroUnclaimedOriginalPage} from "../lib/geomacro-original-page-readback.mjs";
import {preparePrivateOriginalSigningReview} from "../lib/private-original-signing-review-intake.mjs";
import {summarizePrivateOriginalIntakeFunnel} from "../lib/private-original-intake-funnel.mjs";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client";
import {selectPriorityOriginalReviewCountry} from "../../src/lib/priority-original-review-country";

// Existing 02,08,14,20 UTC cron: four genuinely independent country
// candidates/day, with a 195-slot deterministic cycle instead of rechecking
// only USA/GBR/CAN forever. One review lead is NOT a verified country event.
export function countryForThisRun(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("PRIVATE_ORIGINAL_ROTATION_CLOCK_INVALID");
 const slot=Math.floor((now.getTime()-2*3_600_000)/(6*3_600_000));
 const index=((slot%COUNTRIES_195.length)+COUNTRIES_195.length)%COUNTRIES_195.length;
 return COUNTRIES_195[index].iso3;
}
export function safePrivateReviewDir(target,repoRoot=process.cwd(),gha=false){
 if(gha||!isAbsolute(target??"")||!existsSync(target))
   throw Error("PRIVATE_ORIGINAL_LOCAL_CUSTODY_NOT_AVAILABLE");
 const dir=realpathSync(target),base=realpathSync(repoRoot);
 const info=lstatSync(dir);
 const rel=relative(base,dir);
 if(!info.isDirectory()||info.isSymbolicLink()||
    (info.mode&0o077)!==0||rel===""||
    (!rel.startsWith(".."+sep)&&rel!=="..")||
    dir===base)
   throw Error("PRIVATE_ORIGINAL_LOCAL_CUSTODY_NOT_ISOLATED");
 return dir;
}
export function persistLocalPrivateOriginals({leads,dir,now,gha=false}){
 if(!Array.isArray(leads)||leads.length===0)
  return {private_leads_persisted:0,local_file_created:false};
 const path=safePrivateReviewDir(dir,process.cwd(),gha);
 const digest=createHash("sha256").update(JSON.stringify(leads)).digest("hex");
 const name="geomacro-original-pre-review-"+now.toISOString().slice(0,10)+
  "-"+digest.slice(0,18)+".json";
 const bytes=JSON.stringify({
  schema:"geomacro.private-original-signing-review-batch.v1",
  created_at:now.toISOString(),
  immutable_candidate_set_sha256:digest,
  review_only:true,not_signed:true,rights_pending:true,
  independent_semantic_fact_review_pending:true,
  leads,
 },null,2)+"\n";
 writeFileSync(resolve(path,name),bytes,{flag:"wx",mode:0o600});
 return {private_leads_persisted:leads.length,local_file_created:true};
}
export async function main(){
 const now=new Date();
 // A manual owner selection always wins, with no extra D1 GET.
 // The scheduled private review may prioritize the SAME source-neutral 72h
 // D1 journal that Intelligence, Ask and the free/API research consume.
 // This chooses WHAT country to verify, NEVER signs/verifies the D1 lead.
 const manuallyRequested=process.env.GEOMACRO_REVIEW_COUNTRY_ISO3||"";
 const rotatingCountry=countryForThisRun(now);
 let country_iso3=manuallyRequested||rotatingCountry;
 let journalPriorityMode=manuallyRequested?
   "MANUAL_COUNTRY_ORIGINAL_REVIEW":"CANONICAL_195_ROTATION";
 let journalCandidateCountries=0;
 if(!manuallyRequested){
   try {
     const sharedNews=await fetchAllDerivedNews(fetch,now.getTime());
     const decision=selectPriorityOriginalReviewCountry(sharedNews,rotatingCountry,now);
     country_iso3=decision.country_iso3;
     journalPriorityMode=decision.selection_mode;
     journalCandidateCountries=decision.eligible_country_count;
   }catch{
     journalPriorityMode="SHARED_D1_UNAVAILABLE_CANONICAL_195_ROTATION";
   }
 }
 if(!country195ByIso3(country_iso3))
  throw Error("PRIVATE_ORIGINAL_COUNTRY_NOT_IN_CANONICAL_195");
 let discoveryCalls=0,pageCalls=0,byteCalls=0;
 const boundedFetch=(phase)=>async(input,init)=>{
  if((phase==="discovery"?++discoveryCalls:
      phase==="page"?++pageCalls:++byteCalls)>
     (phase==="discovery"?12:phase==="page"?4:2))
   throw Error("PRIVATE_ORIGINAL_SOURCE_REQUEST_BUDGET_EXCEEDED");
  const u=new URL(String(input));
  if(u.protocol!=="https:"||u.username||u.password||u.port||
     (init?.method??"GET")!=="GET"||
     !["error","manual"].includes(init?.redirect))
   throw Error("PRIVATE_ORIGINAL_SOURCE_REQUEST_INVALID");
  return fetch(input,init);
 };
 const discovery=await discoverDirectPublisherForPrivateQualification({
  country_iso3,categories:["geopolitics","macro","rare_earth"],
  max_age_seconds:ORIGINAL_VERIFICATION_WINDOW_SECONDS,
 },{now,fetchImpl:boundedFetch("discovery")});
 const pages=await verifyOnDemandOriginalArticlePages(
  discovery.private_original_review_candidates,
  {now,maxAgeSeconds:ORIGINAL_VERIFICATION_WINDOW_SECONDS,fetchImpl:boundedFetch("page")});
 const {receipt,leads}=await preparePrivateOriginalSigningReview({
  country_iso3,discovery,pages,now,
  readback:({original,now})=>verifyGeomacroUnclaimedOriginalPage({
   original,now,fetchImpl:boundedFetch("bytes"),
  }),
 });
 if(discoveryCalls>12||pageCalls>4||byteCalls>2||
    receipt.discovery_attempts!==discoveryCalls||
    receipt.original_page_attempts!==pageCalls||
    receipt.byte_exact_rereads_attempted!==byteCalls||
    receipt.signed_machine_input_created!==false||
    receipt.article_specific_commercial_rights_verified!==false||
    receipt.x402_payment_authorized!==false)
  throw Error("PRIVATE_ORIGINAL_BUDGET_OR_AUTHORITY_MISMATCH");
 let persist={private_leads_persisted:0,local_file_created:false};
 if(process.env.GEOMACRO_PRIVATE_REVIEW_DIR){
  if(process.env.GEOMACRO_PRIVATE_REVIEW_EXPLICIT_SAVE!=="YES"||
     process.env.GITHUB_ACTIONS==="true")
   throw Error("PRIVATE_ORIGINAL_LOCAL_SAVE_NOT_AUTHORIZED");
  persist=persistLocalPrivateOriginals({leads,
   dir:process.env.GEOMACRO_PRIVATE_REVIEW_DIR,now});
 }
 const safe={...receipt,
  discovery_funnel:summarizePrivateOriginalIntakeFunnel({discovery,pages,receipt}),
  country_selection_mode:journalPriorityMode,
  shared_journal_candidate_country_count:journalCandidateCountries,
  journal_observation_is_not_original_page_evidence:true,
  shared_journal_does_not_grant_rights_or_signatures:true,
  scheduled_ingest_and_on_demand_engine_are_shared:true,
  local_custodian_save_enabled:persist.local_file_created,
  private_leads_persisted_to_custodian:persist.private_leads_persisted,
  signed_input_created:false};
 mkdirSync("artifacts/original-evidence",{recursive:true});
 writeFileSync("artifacts/original-evidence/pre-review-receipt.json",
  JSON.stringify(safe,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(safe));
}
if(import.meta.main){
 try{await main()}catch{
  console.error("::error::PRIVATE_ORIGINAL_REVIEW_INTAKE_UNAVAILABLE_OR_UNVERIFIED");
  process.exitCode=2;
 }
}
