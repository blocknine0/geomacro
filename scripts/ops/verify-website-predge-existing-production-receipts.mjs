#!/usr/bin/env node
/**
 * GitHub Actions receipt-only GeoMacro production acceptance. It reuses the
 * existing hourly Website D1 exact-readback and existing PREDGE protected-live
 * receipts. NO new D1, partner, publisher, B2, payment, or Cloudflare requests.
 *
 * A green PR contract/skipped protected job is never a live pass.
 * The proof is about a bounded 72h captured cohort, not customer receipt ACK.
 */
const REPO="blocknine0/geomacro";
const API="https://api.github.com/repos/"+REPO;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const MAX_PREDGE_AGE_MS=90*60_000;
const MAX_STATIC_AGE_MS=6*60*60_000;
const MAX_PAIR_GAP_MS=20*60_000;
const fail=x=>{throw Error("WEBSITE_PREDGE_PRODUCTION_"+x)};
const categoriesEqual=counts=>counts&&CATEGORIES.every(c=>
  Number.isSafeInteger(counts[c])&&counts[c]>=0);
const sum=counts=>CATEGORIES.reduce((n,c)=>n+counts[c],0);

export function verifyExistingRunReceipts({canonical,protectedLive,archive,proof,now}){
 if(!Number.isFinite(now)||!proof||!canonical||!protectedLive||!archive)
  fail("EVIDENCE_MISSING");
 const sourceAt=Date.parse(proof.source_completed_at);
 const authAt=Date.parse(proof.protected_completed_at);
 const archiveAt=Date.parse(proof.archive_completed_at);
 if(![sourceAt,authAt,archiveAt].every(Number.isFinite)||
    sourceAt>authAt||authAt-sourceAt>MAX_PAIR_GAP_MS||
    now-authAt>MAX_PREDGE_AGE_MS||authAt>now+60_000||
    archiveAt>now+60_000||now-archiveAt>MAX_STATIC_AGE_MS)
  fail("LIVE_RECEIPT_AGE_OR_ORDER");
 if(proof.source_job!=="refresh-derived-news"||
    proof.partner_job!=="protected-live-check"||
    proof.archive_job!=="deploy-public-static-archive"||
    proof.source_result!=="success"||
    proof.partner_result!=="success"||
    proof.archive_result!=="success"||
    ![proof.source_run_url,proof.partner_run_url,proof.archive_run_url]
      .every(x=>typeof x==="string"&&x.startsWith("https://github.com/blocknine0/geomacro/actions/runs/")))
  fail("AUTH_OR_RUN_PROVENANCE_UNVERIFIED");
 if(canonical.schema!=="geomacro.website-predge-common-journal-catchup.v1"||
    canonical.same_canonical_d1_journal_for_website_and_partner!==true||
    canonical.source_clocks_preserved!==true||
    canonical.exact_source_native_payloads_verified!==true||
    canonical.missing_eligible_ids!==0||
    canonical.conflicting_existing_ids!==0||
    canonical.retention_hours!==72||
    canonical.authenticated_partner_live_delivery_verified!==false||
    canonical.real_money_payments!==0||
    !categoriesEqual(canonical.readback_category_counts)||
    sum(canonical.readback_category_counts)!==canonical.readback_eligible_ids||
    canonical.readback_eligible_ids!==canonical.eligible_archive_ids)
  fail("CANONICAL_EXACT_READBACK_UNVERIFIED");
 const expected=canonical.eligible_partner_projection;
 if(expected?.schema!=="geomacro.website-shared-partner-expected-projection.v1"||
    expected.canonical_exact_readback_verified!==true||
    expected.all_eligible_ids_accounted_for!==true||
    expected.same_existing_canonical_journal!==true||
    expected.expected_attributed_projection_only!==true||
    expected.authenticated_partner_live_delivery_verified!==false||
    expected.additional_d1_reads!==0||
    expected.additional_partner_gets!==0||
    expected.eligible_archive_ids!==canonical.eligible_archive_ids||
    expected.missing_canonical_ids!==0||
    !categoriesEqual(expected.category_archive_eligible)||
    !categoriesEqual(expected.category_expected_attributed_partner_ids)||
    !categoriesEqual(expected.category_rights_credit_withheld))
  fail("ELIGIBLE_ATTRIBUTION_PROJECTION_UNVERIFIED");
 for(const c of CATEGORIES)
  if(expected.category_archive_eligible[c]!==canonical.readback_category_counts[c]||
     expected.category_archive_eligible[c]!==expected.category_expected_attributed_partner_ids[c]+
       expected.category_rights_credit_withheld[c])
   fail("ELIGIBLE_CATEGORY_ACCOUNTING_MISMATCH");
 if(protectedLive.schema!=="geomacro.predge-continuity-receipt.v1"||
    protectedLive.authenticated_research_verified!==true||
    protectedLive.shared_d1_items_verified!==true||
    protectedLive.attributed_research!==true||
    protectedLive.daily_request_hard_cap!==500||
    protectedLive.paid_launch_approved!==false||
    protectedLive.execution_authorized!==false||
    protectedLive.payments!==0||
    !categoriesEqual(protectedLive.category_counts))
  fail("PROTECTED_AUTHENTICATED_LIVE_UNVERIFIED");
 for(const c of CATEGORIES)
  if(protectedLive.category_counts[c]<
     expected.category_expected_attributed_partner_ids[c])
   fail("PROTECTED_PROJECTION_COUNT_BELOW_EXPECTED");
 if(archive.schema!=="geomacro.permanent-public-finds-static-readback.v1"||
    archive.public_index_readback_verified!==true||
    archive.public_latest_readback_verified!==true||
    archive.public_72h_coverage_exact_readback_verified!==true||
    archive.full_72h_eligible_ids_hash_verified!==true||
    archive.d1_reads!==0||archive.predge_gets!==0||archive.payments!==0)
  fail("PUBLIC_STATIC_ARCHIVE_READBACK_UNVERIFIED");
 return Object.freeze({
  schema:"geomacro.website-predge-shared-quota-production-proof.v1",
  accepted:true,
  acceptance_scope:"EXISTING_RUN_RECEIPT_CONSISTENCY_ONLY",
  same_instant_cross_run_source_native_id_set_verified:false,
  full_end_to_end_partner_id_parity_verified:false,
  verification:"GITHUB_EXISTING_NON_SKIPPED_PROTECTED_AND_PUBLISHER_RECEIPTS",
  eligible_archive_ids:canonical.eligible_archive_ids,
  expected_partner_items_by_category:expected.category_expected_attributed_partner_ids,
  rights_withheld_by_category:expected.category_rights_credit_withheld,
  authenticated_partner_items_by_category:protectedLive.category_counts,
  qualified_release_by_category:protectedLive.category_delivery_ready,
  same_d1_journal:true,retention_hours:72,
  attribution_rules_preserved:true,
  source_native_clocks_verified:true,
  public_archive_live_readback_verified:true,
  protected_live_authenticated_parity_verified:true,
  cross_run_id_digest_missing:true,
  no_extra_d1_reads_or_partner_gets_for_acceptance:true,
  additional_d1_reads:0,additional_predge_gets:0,
  new_publisher_fetches:0,payments:0,
  source_run_url:proof.source_run_url,
  partner_run_url:proof.partner_run_url,
  archive_run_url:proof.archive_run_url,
 });
}
function fromLogs(log,schema){
 // Raw logs may contain command echoes, but accepted receipts are complete
 // JSON at the start of a GitHub Actions timestamped stdout line.
 const lines=String(log).split("\n");
 const found=[];
 for(const line of lines){
  const m=line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+(\{.*\})\s*$/);
  if(!m)continue;
  try{
   const obj=JSON.parse(m[1]);
   if(obj?.schema===schema)found.push(obj);
  }catch{/* not an entire validated JSON receipt */}
 }
 if(found.length!==1)fail("RECEIPT_ABSENT_OR_DUPLICATED");
 return found[0];
}
async function githubGet(path,token,raw=false,fetchImpl=fetch){
 const url=API+path;
 const r=await fetchImpl(url,{redirect:"follow",cache:"no-store",
  headers:{Authorization:"Bearer "+token,Accept:raw?"application/vnd.github.raw+json":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28","User-Agent":"GeoMacro-shared-news-evidence"},
  signal:AbortSignal.timeout(15_000)});
 if(r.status!==200)fail("GITHUB_EVIDENCE_HTTP_"+r.status);
 const text=await r.text();
 if(text.length>(raw?3_500_000:2_000_000))fail("GITHUB_EVIDENCE_OVERSIZE");
 if(raw)return text;
 try{return JSON.parse(text)}catch{fail("GITHUB_EVIDENCE_INVALID_JSON")}
}
async function latestRun(workflow,jobName,schema,token,now,range,read=githubGet){
 const document=await read("/actions/workflows/"+workflow+"/runs?branch=main&status=completed&per_page=15",token);
 if(!Array.isArray(document.workflow_runs))fail("GITHUB_RUN_INVENTORY_INVALID");
 for(const run of document.workflow_runs){
  if(run.conclusion!=="success"||run.head_branch!=="main"||
     run.head_repository?.full_name!==REPO)continue;
  const completed=Date.parse(run.updated_at??"");
  if(!Number.isFinite(completed)||completed>now+60_000||now-completed>range)
   continue;
  const data=await read("/actions/runs/"+run.id+"/jobs?per_page=100",token);
  const jobs=data.jobs??[];
  const job=jobs.find(j=>j.name===jobName&&j.conclusion==="success"&&
    j.status==="completed");
  if(!job)continue; // PR's skipped job never authorizes production.
  const log=await read("/actions/jobs/"+job.id+"/logs",token,true);
  let receipt;
  try{receipt=fromLogs(log,schema)}catch{continue}
  return {receipt,run,job,completed:job.completed_at};
 }
 fail("NO_CURRENT_NON_SKIPPED_"+jobName.toUpperCase().replace(/-/g,"_"));
}
export async function checkExistingProductionEvidence({
 token=process.env.GITHUB_TOKEN,now=Date.now(),read=githubGet
}={}){
 if(typeof token!=="string"||token.length<20)fail("GITHUB_READ_TOKEN_MISSING");
 const partner=await latestRun("predge-research-continuity.yml","protected-live-check",
   "geomacro.predge-continuity-receipt.v1",token,now,MAX_PREDGE_AGE_MS,read);
 const publisher=await latestRun("website-derived-news-continuity.yml","refresh-derived-news",
   "geomacro.website-predge-common-journal-catchup.v1",token,
   Date.parse(partner.completed),MAX_PAIR_GAP_MS,read);
 const archive=await latestRun("deploy-permanent-public-finds-archive.yml",
   "deploy-public-static-archive","geomacro.permanent-public-finds-static-readback.v1",
   token,now,MAX_STATIC_AGE_MS,read);
 const proof={source_completed_at:publisher.completed,
  protected_completed_at:partner.completed,archive_completed_at:archive.completed,
  source_job:"refresh-derived-news",partner_job:"protected-live-check",
  archive_job:"deploy-public-static-archive",
  source_result:publisher.job.conclusion,partner_result:partner.job.conclusion,
  archive_result:archive.job.conclusion,
  source_run_url:publisher.run.html_url,partner_run_url:partner.run.html_url,
  archive_run_url:archive.run.html_url};
 return verifyExistingRunReceipts({
  canonical:publisher.receipt,protectedLive:partner.receipt,
  archive:archive.receipt,proof,now,
 });
}
if(process.argv[1]?.endsWith("verify-website-predge-existing-production-receipts.mjs")){
 checkExistingProductionEvidence().then(r=>console.log(JSON.stringify(r)))
 .catch(e=>{
  const s=String(e?.message??"");
  console.error("::error::"+(/^WEBSITE_PREDGE_PRODUCTION_[A-Z0-9_]+$/.test(s)?
    s:"WEBSITE_PREDGE_PRODUCTION_EVIDENCE_UNAVAILABLE"));
  process.exitCode=2;
 });
}
