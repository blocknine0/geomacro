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
import {archivePrivateOriginalReviewLeads} from "../lib/private-original-review-b2-handoff.mjs";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {chooseOriginalReviewCountry,finalizeOriginalReviewCountry} from "../lib/original-review-opportunity-router.mjs";

// Only when genuinely verified leads exist do we resolve the existing D1
// governor. Empty candidate runs do not require a B2 credential or API call.
async function resolveOriginalReviewD1Id(env:NodeJS.ProcessEnv,fetchImpl=fetch){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(env.CLOUDFLARE_API_TOKEN??"");
 if(!/^[a-z0-9-]{16,64}$/i.test(account)||token.length<20)
  throw Error("PRIVATE_ORIGINAL_ARCHIVE_D1_CREDENTIALS_MISSING");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+
   encodeURIComponent(account)+"/d1/database?per_page=100";
 const res=await fetchImpl(endpoint,{
  method:"GET",redirect:"error",headers:{Authorization:"Bearer "+token},
  signal:AbortSignal.timeout(15000),
 });
 if(!res.ok||res.redirected)throw Error("PRIVATE_ORIGINAL_ARCHIVE_D1_LOOKUP_UNAVAILABLE");
 const doc=await res.json();
 const rows=doc?.result;
 if(doc?.success!==true||!Array.isArray(rows)||rows.length>100)
  throw Error("PRIVATE_ORIGINAL_ARCHIVE_D1_LOOKUP_UNVERIFIED");
 const matches=rows.filter((x:any)=>x?.name==="geomacro-control-plane");
 const id=matches.length===1?String(matches[0].uuid??matches[0].id??""):"";
 if(!/^[a-z0-9-]{16,64}$/i.test(id))
  throw Error("PRIVATE_ORIGINAL_ARCHIVE_D1_ID_NOT_VERIFIED");
 return id;
}

export function requireProtectedOriginalArchiveMain(env:NodeJS.ProcessEnv) {
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/.test(env.GITHUB_RUN_ID??"")||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="original_review_leads"||
    env.B2_REQUEST_BUDGET!=="6")
   throw Error("PRIVATE_ORIGINAL_ARCHIVE_PROTECTED_MAIN_ONLY");
 return true;
}

// Hourly source-native intake is required to have a realistic chance
// of meeting the existing <=90m GRI review window; every hour rotates
// to another canonical country unless a real shared-journal country is
// independently selected. A scan is NOT proof of current 195x3 events.
export function countryForThisRun(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("PRIVATE_ORIGINAL_ROTATION_CLOCK_INVALID");
 const slot=Math.floor(now.getTime()/3_600_000);
 const index=((slot%COUNTRIES_195.length)+COUNTRIES_195.length)%COUNTRIES_195.length;
 return COUNTRIES_195[index].iso3;
}
// Three categories require three independent rereads. A native GOV.UK clock
// can need HTML + its pinned Content API in EACH verification phase. Reserve
// both GETs/category instead of failing the third domain before any review.
export const ORIGINAL_REVIEW_GET_BUDGET=Object.freeze({discovery:12,page:6,bytes:6});
export function privateOriginalBudgetedFetch(fetchImpl:typeof fetch=fetch){
 const counts={discovery:0,page:0,bytes:0};
 return {
  counts:()=>({...counts}),
  forPhase:(phase:keyof typeof counts)=>async(input:RequestInfo|URL,init?:RequestInit)=>{
   if(!Object.hasOwn(counts,phase)||counts[phase]>=ORIGINAL_REVIEW_GET_BUDGET[phase])
    throw Error("PRIVATE_ORIGINAL_SOURCE_REQUEST_BUDGET_EXCEEDED");
   const u=new URL(String(input));
   if(u.protocol!=="https:"||u.username||u.password||u.port||
      (init?.method??"GET")!=="GET"||
      !["error","manual"].includes(init?.redirect??""))
    throw Error("PRIVATE_ORIGINAL_SOURCE_REQUEST_INVALID");
   counts[phase]++;
   return fetchImpl(input,init);
  },
 };
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
 // First prefer <90m issuer observations; if none, only the genuine 22h
 // pre-review window is recovered, without extending scored GRI freshness.
 // This chooses WHAT country to verify, NEVER signs/verifies the D1 lead.
 const manuallyRequested=process.env.GEOMACRO_REVIEW_COUNTRY_ISO3||"";
 // The 195 fairness slot remains mandatory, while known direct-issuer
 // country SUBJECTS get additional chances rather than wasting every
 // hourly scan on a quiet randomized country. No provider GET added.
 const opportunity=chooseOriginalReviewCountry({
   now,fairnessCountryForRun:countryForThisRun,
   existsInRegistry:code=>Boolean(country195ByIso3(code))
 });
 const rotatingCountry=opportunity.country_iso3;
 let country_iso3=manuallyRequested||rotatingCountry;
 let journalPriorityMode=manuallyRequested?
   "MANUAL_COUNTRY_ORIGINAL_REVIEW":opportunity.selection_mode;
 let journalCandidateCountries=0;
 if(!manuallyRequested){
   try {
     const sharedNews=await fetchAllDerivedNews(fetch,now.getTime());
     const decision=selectPriorityOriginalReviewCountry(sharedNews,rotatingCountry,now);
     const routed=finalizeOriginalReviewCountry({
       opportunity,priority:decision,
       existsInRegistry:code=>Boolean(country195ByIso3(code)),
     });
     country_iso3=routed.country_iso3;
     journalPriorityMode=routed.mode;
     journalCandidateCountries=routed.journal_eligible_countries;
   }catch{
     journalPriorityMode="SHARED_D1_UNAVAILABLE_"+opportunity.selection_mode;
   }
 }
 if(!country195ByIso3(country_iso3))
  throw Error("PRIVATE_ORIGINAL_COUNTRY_NOT_IN_CANONICAL_195");
 const network=privateOriginalBudgetedFetch();
 const boundedFetch=network.forPhase;
 // Reuse the canonical direct-publisher entrypoint with explicit category
 // topics. Omitted topics previously skipped current-event issuer-search
 // rescue and consumed original-evidence slots on indexes/annual context.
 // The existing 12 GET discovery cap and issuer/date/rights checks remain.
 const discovery=await discoverDirectPublisherForPrivateQualification({
  country_iso3,categories:["geopolitics","macro","rare_earth"],
  max_age_seconds:ORIGINAL_VERIFICATION_WINDOW_SECONDS,
 },{now,fetchImpl:boundedFetch("discovery")});
 const pages=await verifyOnDemandOriginalArticlePages(
  discovery.private_original_review_candidates,
  {now,maxAgeSeconds:ORIGINAL_VERIFICATION_WINDOW_SECONDS,maxProbes:3,
   fetchImpl:boundedFetch("page"),diagnostics:true});
 const {receipt,leads}=await preparePrivateOriginalSigningReview({
  country_iso3,discovery,pages,now,maxRereads:3,
  readback:({original,now})=>verifyGeomacroUnclaimedOriginalPage({
   original,now,fetchImpl:boundedFetch("bytes"),
  }),
 });
 const {discovery:discoveryCalls,page:pageCalls,bytes:byteCalls}=network.counts();
 if(discoveryCalls>12||pageCalls>6||byteCalls>6||
    receipt.discovery_attempts!==discoveryCalls||
    receipt.original_page_attempts!==pages.attempted||
    pageCalls<pages.attempted||
    pageCalls>pages.attempted*2||
    receipt.byte_exact_rereads_attempted>byteCalls||
    byteCalls>receipt.byte_exact_rereads_attempted*2||
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
 let privateArchive={
  schema:"geomacro.private-original-review-b2-handoff.v1",
  status:"NOT_ENABLED_LOCAL_OPERATOR_ONLY",
  private_original_leads_archived:0,
  private_review_hand_off_available:false,
  rights_or_gri_signed:false,b2_requests:0,d1_writes:0,payments:0
 };
 if(process.env.GEOMACRO_ORIGINAL_PRIVATE_ARCHIVE_ENABLED==="1"){
   requireProtectedOriginalArchiveMain(process.env);
   if(leads.length>0){
     process.env.D1_DATABASE_ID=await resolveOriginalReviewD1Id(process.env);
   }
   privateArchive=await archivePrivateOriginalReviewLeads({
    leads,now,countryIso3:country_iso3,
    quotaGovernor:leads.length>0?createB2D1AccountGovernor():null,
    b2Factory:()=>createB2Client({
     endpointUrl:"https://s3.us-east-005.backblazeb2.com",
     bucket:"geomacro-private-archive",
     accessKey:process.env.B2_KEY_ID,
     secretKey:process.env.B2_APPLICATION_KEY,
    }),
   });
 }
 const safe={...receipt,
  // The pre-review receipt's initial zero counts only source verification.
  // Once a protected private B2 PUT+GET occurs, do not print a false
  // top-level claim that NO B2 request happened.
  B2_requests:privateArchive.private_review_hand_off_available?undefined:0,
  private_original_archive_handoff:privateArchive,
  original_page_related_network_requests:pageCalls,
  original_byte_stage_network_requests:byteCalls,
  extra_first_party_api_reads_accounted_for_within_existing_quota:true,
  discovery_funnel:summarizePrivateOriginalIntakeFunnel({discovery,pages,receipt}),
  country_selection_mode:journalPriorityMode,
  fallback_country_selection_mode:opportunity.selection_mode,
  fallback_publisher_heuristic_only:opportunity.publisher_hub_heuristic_only,
  fallback_global_fairness_preserved:true,
  original_source_not_certified_by_country_routing:true,
  additional_original_source_requests_from_router:0,
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
 if(leads.length>0&&
    process.env.GEOMACRO_ORIGINAL_PRIVATE_ARCHIVE_ENABLED==="1"&&
    privateArchive.private_review_hand_off_available!==true)
   throw Error("PRIVATE_ORIGINAL_VERIFIED_LEAD_NOT_PRIVATELY_RETAINED");
}
if(import.meta.main){
 try{await main()}catch{
  console.error("::error::PRIVATE_ORIGINAL_REVIEW_INTAKE_UNAVAILABLE_OR_UNVERIFIED");
  process.exitCode=2;
 }
}
