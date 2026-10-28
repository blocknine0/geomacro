#!/usr/bin/env bun
/**
 * Free original-publisher release -> only Geomacro-owned structured cards -> D1.
 * Never persists or prints raw upstream titles, provider IDs, URLs, feed XML,
 * origin article bodies, raw-article fingerprints, payment data or GRO scores.
 * GitHub schedule is best effort; website also does live on-demand reads.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { summarizeDerivedSourceHealth } from "../lib/derived-news-source-health.mjs";
import {prepareDerivedNewsBatches} from '../lib/derived-news-d1-batches.mjs';
import { buildMaterialGriNewsReviewQueue } from "../lib/material-gri-news-review.mjs";
import { readStatelessWebsiteIntelligence } from "../../src/lib/stateless-public-intelligence.server";
import {createRunScopedAustralianResourcesFetch} from "../../src/lib/stateless-run-shared-official-fetch";
import {
  conservativeDayReleaseMs,reconcilePrivateDerivedSourceRefs,selectBoundedRetainedOriginalTargets,
  type StatelessSourceCandidate,
  type StatelessIntelligenceSignal,
} from "../../src/lib/stateless-intelligence-model";
import {checkedDerivedNews,fetchAllDerivedNews} from "../../src/lib/public-derived-news-client";
import {auditEveryDerivedNewsOriginal} from "../lib/all-news-original-evidence-audit.mjs";
import type {StatelessIntelligenceResult} from "../../src/lib/stateless-public-intelligence.server";
import {DERIVED_NEWS_TOPIC_POLICY_REVISION,requireDerivedNewsWorkerPolicy} from "../lib/derived-news-readback-policy.mjs";
import {safeDerivedNewsD1FailureClass} from "../lib/derived-news-d1-failure.mjs";

const ARCHIVE_ONLY = process.env.GEOMACRO_DERIVED_ARCHIVE_ONLY === "1";
const ROOT = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
if (!ARCHIVE_ONLY && ROOT.length < 32) throw Error("DERIVED_NEWS_PUBLISH_TOKEN_MISSING");
const TOKEN = ARCHIVE_ONLY ? "" : createHmac("sha256",ROOT).update("geomacro-control-plane-v1").digest("hex");
const CONTROL_PLANE_ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const ENDPOINT=CONTROL_PLANE_ORIGIN+"/v1/website-derived-news";
const categories=["geopolitics","macro","rare_earth"] as const;
const noSupabase=fetch.bind(globalThis);
let denied=0;
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname==="supabase.co"||url.hostname.endsWith(".supabase.co")||
     url.hostname==="supabase.com"||url.hostname.endsWith(".supabase.com")){
    denied++;
    throw Error("DERIVED_NEWS_SUPABASE_BLOCKED");
  }
  return noSupabase(input,init);
}) as typeof fetch;

let success=true;
const privateOriginals:StatelessSourceCandidate[]=[];
const reports:StatelessIntelligenceResult[]=[];
// Safe derived-only candidates are exported for the independent permanent website archive.
// This happens before D1 publication, so a D1 quota outage does not discard the daily findings.
const archiveCandidateSignals:StatelessIntelligenceSignal[]=[];
const sourceHealthReceipts:Array<{category:string}>=[];
const sharedOfficialDocuments=createRunScopedAustralianResourcesFetch();
// Fail closed before any original-source reads or D1 writes if the live Worker
// has not deployed the exact readback/topic allowlist contract this publisher
// emits. A repository push can start this workflow before Worker deployment.
// Public archive ingestion must continue even while account-wide D1 reads
// are quota-blocked. Only the optional D1 write/checkpoint path requires a
// live Worker policy handshake. Static archive candidates are still built
// from validated original-publisher feeds and independently revalidated.
let workerPolicyReady=false;
if (!ARCHIVE_ONLY) try{
  const workerPolicy=await requireDerivedNewsWorkerPolicy({
    fetchImpl:globalThis.fetch,url:CONTROL_PLANE_ORIGIN+"/health",
    expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
  });
  workerPolicyReady=true;
  console.log(JSON.stringify({...workerPolicy,d1_publisher_ready:true}));
}catch{
  console.warn("D1_PUBLISHER_UNAVAILABLE_STATIC_ARCHIVE_CONTINUES");
}
for (const category of categories) {
  try {
    const lanes:{index:number;transport_ok:boolean;failure_class?:string}[]=[];
    const report=await readStatelessWebsiteIntelligence(category,Date.now(),
      (index, diagnostics)=>lanes.push({index,transport_ok:diagnostics.transport_ok,
        failure_class:diagnostics.transport_failure_class}),
      candidates=>privateOriginals.push(...candidates),200,sharedOfficialDocuments);
    const health=summarizeDerivedSourceHealth(category,report.feed_count,report.healthy_feed_count,lanes);
    sourceHealthReceipts.push(health);
    if(health.sources_unavailable>0 || !health.diagnostics_complete)
      console.warn("::warning::DERIVED_NEWS_FREE_SOURCES_DEGRADED_"+category.toUpperCase());
    console.log(JSON.stringify(health));
    if (report.healthy_feed_count === 0) throw Error("OFFICIAL_FEEDS_UNREACHABLE");
    reports.push(report);
    // Already derived by the publisher model; this is a belt-and-braces
    // future-clock gate before D1 writes. Day-only releases conservatively wait.
    const checked=Date.parse(report.checked_at);
    const eligible=report.signals.filter(signal=>{
      const at=Date.parse(signal.published_at);
      return signal.category===category && Number.isFinite(at) &&
        at>=checked-72*60*60_000 && at<=checked &&
        (signal.date_precision==="day"
          ? (conservativeDayReleaseMs(signal.published_at)??Infinity)<=checked
          : at<=checked) &&
        signal.severity===null && signal.same_event_corrob_verified===false &&
        signal.sources_credited.every(v=>typeof v==="string");
    });
    // Existing D1 journal remains capped at 600 rows; each source-neutral
    // eligible release is processed, with 40-row chunks under the control
    // plane's strict 64KiB authenticated request limit. No upstream bytes.
    // EMPTY batches remain required for truthful retention sweeps.
    const {signals,chunks}=prepareDerivedNewsBatches(eligible);
    // Archive candidates before any D1 writes so a daily-row quota failure
    // cannot discard this run's newly verified Geomacro-derived findings.
    archiveCandidateSignals.push(...signals);
    if(!workerPolicyReady){
      console.log(JSON.stringify({
        schema:"geomacro.website-derived-news-ingest-metrics.v1",category,
        source_feeds_healthy:report.healthy_feed_count,
        official_candidates:report.releases_examined,
        archive_candidates:signals.length,
        d1_write_skipped:true,
        reason:"D1_PUBLISHER_POLICY_PREFLIGHT_UNAVAILABLE",
        supabase_attempts:denied,payments:0,
      }));
    }else{
      let acknowledged=0;
      for(const chunk of chunks){
        if(chunk.length===0)continue;
        const reply=await fetch(ENDPOINT,{
          method:"PUT",redirect:"error",cache:"no-store",
          headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
          body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:chunk}),
          signal:AbortSignal.timeout(12_000),
        });
        if(!reply.ok){
          let failureClass="D1_UNCLASSIFIED";
          try{const failure=await reply.json() as {diagnostic_code?:unknown};
            failureClass=safeDerivedNewsD1FailureClass(failure?.diagnostic_code);
          }catch{/* Only an allowlisted class may enter the runner log. */}
          throw Error("CLOUDFLARE_DERIVED_NEWS_INGEST_REJECTED_"+reply.status+"_"+failureClass);
        }
        const receipt=await reply.json() as {ok?:boolean;accepted?:number};
        if(receipt.ok!==true||receipt.accepted!==chunk.length)
          throw Error("CLOUDFLARE_DERIVED_NEWS_INGEST_ACK_INVALID");
        acknowledged+=chunk.length;
      }
      if(acknowledged!==signals.length)
        throw Error("CLOUDFLARE_DERIVED_NEWS_INGEST_PARTIAL");
      // A green collection run with ZERO releases remains observable without
      // inventing an event. This checkpoint is optional to the static archive.
      const checkedAt=new Date().toISOString();
      const checkpoint=await fetch(ENDPOINT.replace("/v1/website-derived-news",
        "/v1/checkpoint/website_derived_news_ingest/"+category),{
        method:"PUT",redirect:"error",cache:"no-store",
        headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
        body:JSON.stringify({status:"DERIVED_NEWS_PUBLISH_COMPLETED",
          last_attempt_at:checkedAt,last_success_at:checkedAt,cursor:null,
          metadata:{schema:"geomacro.derived-news-source-check.v1",
            category,checked_at:checkedAt,
            sources_configured:report.feed_count,
            sources_reachable:report.healthy_feed_count,
            original_candidates_examined:report.releases_examined,
            accepted_derived_rows:signals.length,
            raw_upstream_stored:false,commercial_rights_verified:false,
            paid_delivery_authorized:false}}),
        signal:AbortSignal.timeout(12_000),
      });
      if(!checkpoint.ok)throw Error("DERIVED_NEWS_SOURCE_CHECK_WRITE_UNAVAILABLE");
      const checkedReceipt=await checkpoint.json() as {ok?:boolean;scope?:string;pipeline?:string};
      if(checkedReceipt.ok!==true||checkedReceipt.scope!==category||
         checkedReceipt.pipeline!=="website_derived_news_ingest")
        throw Error("DERIVED_NEWS_SOURCE_CHECK_ACK_INVALID");
      console.log(JSON.stringify({
        schema:"geomacro.website-derived-news-ingest-metrics.v1",category,
        source_feeds_healthy:report.healthy_feed_count,
        official_candidates:report.releases_examined,
        accepted_derived_news:signals.length,
        source_check_receipt_d1_verified:true,
        supabase_attempts:denied,storage:"cloudflare-d1-derived-only",
      }));
    }
  } catch(error) {
    success=false;
    if(!sourceHealthReceipts.some(r=>r.category===category))
      sourceHealthReceipts.push({schema:"geomacro.hourly-free-source-health.v1",
        category,status:"CATEGORY_COLLECTION_UNAVAILABLE",diagnostics_complete:false,
        commercial_rights_verified:false,raw_upstream_stored:false});
    const code=error instanceof Error&&/^(?:CLOUDFLARE_DERIVED_NEWS_[A-Z0-9_]+|DERIVED_NEWS_[A-Z0-9_]+|OFFICIAL_FEEDS_UNREACHABLE)$/.test(error.message)
      ?error.message:'UNCLASSIFIED';
    console.error("::error::WEBSITE_DERIVED_NEWS_INGEST_"+category.toUpperCase()+"_UNAVAILABLE_"+code);
  }
}
// Export only validated, source-neutral Geomacro-derived cards for the permanent static archive.
// This receipt deliberately excludes URLs, feed XML, source IDs, source headlines and private references.
try {
  mkdirSync("artifacts/derived-news",{recursive:true});
  const uniqueArchiveCandidates=new Map<string,StatelessIntelligenceSignal>();
  for(const signal of archiveCandidateSignals) uniqueArchiveCandidates.set(signal.id,signal);
  const archiveCandidates={
    schema:"geomacro.permanent-derived-news-candidates.v1",
    checked_at:new Date().toISOString(),
    source_sha:String(process.env.GITHUB_SHA??""),
    signals:[...uniqueArchiveCandidates.values()].sort((a,b)=>
      b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id)),
    raw_upstream_stored:false,source_urls_logged:false,payments:0,
  };
  writeFileSync("artifacts/derived-news/permanent-archive-candidates.json",
    JSON.stringify(archiveCandidates,null,2)+"\n",{encoding:"utf8",mode:0o600});
  console.log(JSON.stringify({schema:"geomacro.permanent-derived-news-candidates-receipt.v1",
    candidates:archiveCandidates.signals.length,source_sha_present:archiveCandidates.source_sha.length===40,
    independent_of_d1_write:true,raw_upstream_stored:false,payments:0}));
}catch {
  success=false;
  console.error("::error::PERMANENT_DERIVED_NEWS_CANDIDATE_EXPORT_FAILED");
}
// Quota-held original collection must be useful without any D1 read, D1 write,
// checkpoint, B2 signer or payment. The existing archive publisher consumes
// the derived candidate artifact in the next workflow step.
if (ARCHIVE_ONLY) {
  console.log(JSON.stringify({schema:"geomacro.archive-only-collection.v1",
    d1_reads:0,d1_writes:0,b2_requests:0,payments:0,
    categories_collected:reports.length,derived_candidates:archiveCandidateSignals.length,
    complete:success&&denied===0}));
  process.exit(success&&denied===0?0:2);
}

// Physical TTL/600-row cleanup is an explicit, authenticated empty batch.
 // Run it once per successful three-category collection, not once per category
 // plus every non-empty news write; failed D1 publication must not amplify load.
if(success&&denied===0&&workerPolicyReady){
  try{
    const sweep=await fetch(ENDPOINT,{
      method:"PUT",redirect:"error",cache:"no-store",
      headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
      body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:[]}),
      signal:AbortSignal.timeout(12_000),
    });
    if(!sweep.ok){
      let failureClass="D1_UNCLASSIFIED";
      try{const failure=await sweep.json() as {diagnostic_code?:unknown};
        failureClass=safeDerivedNewsD1FailureClass(failure?.diagnostic_code);
      }catch{/* Never emit the raw error response. */}
      throw Error("RETENTION_SWEEP_HTTP_"+sweep.status+"_"+failureClass);
    }
    const receipt=await sweep.json() as {ok?:boolean;accepted?:number};
    if(receipt.ok!==true||receipt.accepted!==0)
      throw Error("RETENTION_SWEEP_ACK_INVALID");
    console.log(JSON.stringify({schema:"geomacro.website-derived-news-retention-sweep.v1",
      completed:true,supabase_requests:0,payments:0}));
  }catch(error){
    success=false;
    const message=error instanceof Error?error.message:"";
    const safe=/^RETENTION_SWEEP_(?:HTTP_\d+_)?[A-Z0-9_]+$/u.test(message)
      ?message:"RETENTION_SWEEP_UNCLASSIFIED";
    console.error("::error::"+safe);
  }
}
console.log(JSON.stringify({
  schema:"geomacro.shared-official-original-transport.v1",
  ...sharedOfficialDocuments.stats(),
  scope:"one_ingestion_run_independently_validated_two_category_reuse",
  cross_category_automatic_publication:false,
  rights_review_waived:false,commercially_chargeable:false,
  b2_requests:0,supabase_writes:0,payments:0,
}));
// High-impact / prediction-market-like event triage is derived only from
// the already validated issuer-release *structured* cards. No raw source
// data, odds, article bodies, inferred outcomes, risk scores or publisher IDs
// leave this process. A candidate NEVER authorizes GRI/Indices recomputation.
// The bounded 72h review receipt is useful for a separate signed-evidence gate.
try {
  const queue=buildMaterialGriNewsReviewQueue(reports,Date.now());
  mkdirSync("artifacts/derived-news",{recursive:true});
  writeFileSync("artifacts/derived-news/material-gri-review.json",
    JSON.stringify(queue,null,2),{encoding:"utf8",mode:0o600});
  console.log(JSON.stringify({schema:"geomacro.material-gri-review-health.v1",
    categories:queue.categories.map(c=>({category:c.category,candidates:c.candidates_count})),
    destination:queue.destination,retention_hours:72,
    gri_writes:0,rights_verified:false,payments:0}));
}catch{
  success=false;
  console.error("::error::MATERIAL_GRI_PRIVATE_REVIEW_CANDIDATES_UNAVAILABLE");
}

// Audit ALL source-derived news cards in this publisher run, not merely
// a selected headline or two. A feed read / pubDate is never an exact HTML
// source proof. At most SIX additional strict first-party rechecks TOTAL;
// every other card has an explicitly unverified/deferred status. Original
// URLs, upstream titles and actual HTML SHA are never printed or uploaded.
// Keep these public-safe receipts separate from scored or paid product gates.
try {
  const now=new Date();
  const signals=reports.flatMap(r=>r.signals);
  // Read the bounded, already authenticated derived-only D1 journal so
  // retained articles omitted by the latest per-category source shortlist
  // still have an opportunity for exact private original-reference recovery.
  // D1 failure never grants a missing reference or suppresses the present
  // original-source audit. This is one bounded D1 read, not a publisher GET.
  let retained:typeof signals=[];
  if(workerPolicyReady){
    try{retained=await fetchAllDerivedNews(fetch,now.getTime());}
    catch{console.warn("::warning::RETAINED_ORIGINAL_REFERENCE_JOURNAL_UNAVAILABLE");}
  }else console.warn("::warning::RETAINED_ORIGINAL_REFERENCE_JOURNAL_SKIPPED_D1_UNAVAILABLE");
  const reconciled=new Map<string,StatelessSourceCandidate>();
  for(const category of categories){
    const sourceRefs=privateOriginals.filter(x=>x.category===category);
    // Check every retained D1 row within the existing 600-row journal,
    // not just the first 250. The exact source-ID/clock/payload match remains
    // mandatory; a reference match never qualifies facts, rights or payment.
    const cards=selectBoundedRetainedOriginalTargets(
      signals.filter(x=>x.category===category),
      retained.filter(x=>x.category===category),600);
    for(const [id,ref] of reconcilePrivateDerivedSourceRefs(
      sourceRefs,cards,now.getTime()))reconciled.set(id,ref);
  }
  if(process.env.GEOMACRO_LOW_SOURCE_REVIEW==='1'){
    // Short-lived, private IPC between credential-separated workflow steps.
    // Never upload this file or its result as a public Actions artifact.
    const path=process.env.GEOMACRO_LOW_REVIEW_REFS_FILE??'';
    const temp=process.env.RUNNER_TEMP??'';
    if(!temp||!path.startsWith(temp+'/')||path.includes('/../'))
      throw Error('LOW_REVIEW_PRIVATE_HANDOFF_PATH_INVALID');
    writeFileSync(path,JSON.stringify({refs:[...reconciled]}),{mode:0o600,flag:'wx'});
  }else{
  const audit=await auditEveryDerivedNewsOriginal({
    signals,originalRefs:reconciled,now,maxReadbacks:6,maxPerCategory:4,
  });
  if(audit.ingested_news_examined!==signals.length ||
     audit.exact_page_byte_rereads_attempted>4 ||
     audit.bundled_source_quota?.protected_unused_reserve!==2 ||
     audit.bundled_source_quota?.reserve_touched!==false ||
     audit.signed_commercial_intelligence_created!==false ||
     audit.per_article_commercial_rights_verified!==false ||
     audit.x402_charges!==0)
    throw Error("ALL_NEWS_ORIGINAL_AUDIT_BOUNDARY_FAILED");
  mkdirSync("artifacts/derived-news",{recursive:true});
  writeFileSync("artifacts/derived-news/all-original-evidence-audit.json",
    JSON.stringify(audit,null,2)+"\n",{encoding:"utf8",mode:0o600});
  console.log(JSON.stringify({
    schema:audit.schema,checked_at:audit.checked_at,
    ingested_news_examined:audit.ingested_news_examined,
    exact_page_byte_rereads_attempted:audit.exact_page_byte_rereads_attempted,
    bundled_source_quota:audit.bundled_source_quota,
    verified_original_page_bytes_and_native_time:audit.verified_original_page_bytes_and_native_time,
    pending_or_unverified_news_count:audit.pending_or_unverified_news_count,
    categories:audit.categories,
    commercially_verified:false,payable:false,source_urls_logged:false,
  }));
  }
} catch {
  // Evidence audit unavailable does NOT upgrade RSS-only entries to verified
  // and must not force duplicate ingestion/news polling or paid availability.
  console.warn("::warning::ALL_NEWS_ORIGINAL_EVIDENCE_AUDIT_UNAVAILABLE");
}

// An ephemeral, sanitized hourly source-health artifact helps identify outages
// without storing raw feeds, article links or publisher names. Derived signals
// are already persisted and deduplicated in D1 with a strict 72h/600-row cap.
try {
  mkdirSync("artifacts/derived-news",{recursive:true});
  writeFileSync("artifacts/derived-news/source-health.json",JSON.stringify({
    schema:"geomacro.hourly-free-source-health-run.v1",
    checked_at:new Date().toISOString(),
    github_run_id:String(process.env.GITHUB_RUN_ID??""),
    source_sha:String(process.env.GITHUB_SHA??""),
    categories:sourceHealthReceipts,
    storage:"derived-only-cloudflare-d1",
    persisted_original_urls:false,raw_upstream_stored:false,
    commercial_rights_verified:false,paid_publication_authorized:false,
  },null,2)+"\n",{encoding:"utf8"});
} catch {
  success=false;
  console.error("::error::DERIVED_NEWS_SOURCE_HEALTH_RECEIPT_UNAVAILABLE");
}
if (denied!==0||!success) process.exitCode=2;

// Opted in only in the existing protected continuity workflow. The free D1
// journal above remains independent if signing/archive publication fails.
if(process.env.GEOMACRO_AUTOMATED_FINDS_PUBLICATION==="1"){
  try{
    if(!workerPolicyReady||denied!==0||!success)throw Error("AUTOMATED_FINDS_SOURCE_READ_INCOMPLETE");
    const {publishCollectedAutomatedFinds}=await import("./publish-automated-finds");
    await publishCollectedAutomatedFinds(reports);
  }catch(error){
    // The free 72h D1 journal was independently written before this optional
    // archive path. Archive/signing errors must never turn a *successful*
    // public free collection into an ingest outage or force extra provider
    // polling. Separately report signed Finds unavailable; paid gates stay off.
    // Source/derived-D1 failures still set process.exitCode=2 above.
    const message=error instanceof Error?error.message:"";
    const reason=/^AUTOMATED_FINDS_[A-Z0-9_]+$/.test(message)?message:
      "AUTOMATED_FINDS_SIGNED_ARCHIVE_PUBLICATION_UNAVAILABLE";
    console.warn("::warning::"+reason);
  }
}


// One bounded, metadata-only D1 readback after publishing. The original URLs
// remain EPHEMERAL in this process, and the matrix prints only public opaque
// story IDs, original dates, and verification status. Never print or persist
// privateOriginals, issuer labels, raw headlines or article URLs. The free
// newsroom continues even when this optional trace cannot recover its source.
try {
  if(!workerPolicyReady)throw Error("PERMANENT_ARCHIVE_D1_READBACK_SKIPPED");
  const reply=await fetch(
    "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate",{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(8_000),
  });
  const declared=Number(reply.headers.get("content-length")??0);
  if(!reply.ok||declared>512_000)throw Error("PRIVATE_RECONCILIATION_D1_UNAVAILABLE");
  const body=await reply.text();
  if(body.length>512_000)throw Error("PRIVATE_RECONCILIATION_D1_OVERSIZE");
  const now=Date.now(),signalRows=checkedDerivedNews(JSON.parse(body),now);
  const recovered=reconcilePrivateDerivedSourceRefs(privateOriginals,signalRows,now);
  const recent=signalRows.filter(s=>{
    const at=Date.parse(s.published_at);
    return Number.isFinite(at)&&at>=now-86_400_000&&at<=now;
  });
  const rows=recent.slice(0,32).map(s=>({
    derived_id:s.id,category:s.category,
    original_publication:s.published_at,date_precision:s.date_precision,
    source_original_reference_recovered:recovered.has(s.id),
    independent_fact_verified:false,article_commercial_rights_verified:false,
    signed:false,customer_delivery_eligible:false,
  }));
  const crosswalk={
    schema:"geomacro.private-derived-original-crosswalk-status.v1",
    checked_at:new Date(now).toISOString(),recent_count:recent.length,
    matched_ephemeral_originals:rows.filter(r=>r.source_original_reference_recovered).length,
    rows,raw_source_content_logged:false,source_urls_logged:false,
    persisted_original_urls:false,commercially_authorizing:false,
  };
  if(process.env.RUNNER_TEMP)writeFileSync(process.env.RUNNER_TEMP+'/geomacro-private-source-crosswalk.json',
    JSON.stringify(crosswalk),{mode:0o600,flag:'wx'});
} catch {
  console.warn('::warning::PRIVATE_SOURCE_CROSSWALK_UNAVAILABLE_NO_EVIDENCE_PROMOTION');
}
