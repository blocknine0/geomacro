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
import { readStatelessWebsiteIntelligence } from "../../src/lib/stateless-public-intelligence.server";
import {
  conservativeDayReleaseMs,reconcilePrivateDerivedSourceRefs,
  type StatelessSourceCandidate,
} from "../../src/lib/stateless-intelligence-model";
import {checkedDerivedNews} from "../../src/lib/public-derived-news-client";
import type {StatelessIntelligenceResult} from "../../src/lib/stateless-public-intelligence.server";

const ROOT = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
if (ROOT.length < 32) throw Error("DERIVED_NEWS_PUBLISH_TOKEN_MISSING");
const TOKEN = createHmac("sha256",ROOT).update("geomacro-control-plane-v1").digest("hex");
const ENDPOINT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/website-derived-news";
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
const sourceHealthReceipts:Record<string,unknown>[]=[];
for (const category of categories) {
  try {
    const lanes:{index:number;transport_ok:boolean;failure_class?:string}[]=[];
    const report=await readStatelessWebsiteIntelligence(category,Date.now(),
      (index, diagnostics)=>lanes.push({index,transport_ok:diagnostics.transport_ok,
        failure_class:diagnostics.transport_failure_class}),
      candidates=>privateOriginals.push(...candidates));
    const health=summarizeDerivedSourceHealth(category,report.feed_count,report.healthy_feed_count,lanes);
    sourceHealthReceipts.push(health);
    if(health.sources_unavailable>0 || !health.diagnostics_complete)
      console.warn("::warning::DERIVED_NEWS_FREE_SOURCES_DEGRADED_"+category.toUpperCase());
    console.log(JSON.stringify(health));
    if (report.healthy_feed_count === 0) throw Error("OFFICIAL_FEEDS_UNREACHABLE");
    reports.push(report);
    // Already derived by the publisher model; this is a belt-and-braces
    // 15-minute gate before D1 writes. Day-only releases conservatively wait.
    const checked=Date.parse(report.checked_at);
    const signals=report.signals.filter(signal=>{
      const at=Date.parse(signal.published_at);
      return signal.category===category && Number.isFinite(at) &&
        (signal.date_precision==="day"
          ? (conservativeDayReleaseMs(signal.published_at)??Infinity)<=checked
          : at+15*60_000<=checked) &&
        signal.severity===null && signal.same_event_corrob_verified===false &&
        signal.sources_credited.every(v=>typeof v==="string");
    });
    if (signals.length>0) {
      // The content is transmitted only to OUR authenticated Cloudflare
      // control plane. Never log request or response body.
      const reply=await fetch(ENDPOINT,{
        method:"PUT",redirect:"error",cache:"no-store",
        headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
        body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals}),
        signal:AbortSignal.timeout(12_000),
      });
      if (!reply.ok) throw Error("CLOUDFLARE_DERIVED_NEWS_INGEST_REJECTED_"+reply.status);
      const acknowledgment=await reply.json() as {ok?:boolean;accepted?:number};
      if(acknowledgment.ok!==true || acknowledgment.accepted!==signals.length)
        throw Error("CLOUDFLARE_DERIVED_NEWS_INGEST_ACK_INVALID");
    }
    console.log(JSON.stringify({
      schema:"geomacro.website-derived-news-ingest-metrics.v1",category,
      source_feeds_healthy:report.healthy_feed_count,
      official_candidates:report.releases_examined,
      accepted_derived_news:signals.length,
      supabase_attempts:denied,storage:"cloudflare-d1-derived-only",
    }));
  } catch {
    success=false;
    if(!sourceHealthReceipts.some(r=>r.category===category))
      sourceHealthReceipts.push({schema:"geomacro.hourly-free-source-health.v1",
        category,status:"CATEGORY_COLLECTION_UNAVAILABLE",diagnostics_complete:false,
        commercial_rights_verified:false,raw_upstream_stored:false});
    console.error("::error::WEBSITE_DERIVED_NEWS_INGEST_"+category.toUpperCase()+"_UNAVAILABLE");
  }
}
// An ephemeral, sanitized hourly source-health artifact helps identify outages
// without storing raw feeds, article links or publisher names. Derived signals
// are already persisted and deduplicated in D1 with 30-day/600-row bounds.
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
    if(denied!==0||!success)throw Error("AUTOMATED_FINDS_SOURCE_READ_INCOMPLETE");
    const {publishCollectedAutomatedFinds}=await import("./publish-automated-finds");
    await publishCollectedAutomatedFinds(reports);
  }catch(error){
    process.exitCode=2;
    const message=error instanceof Error?error.message:"";
    const reason=/^AUTOMATED_FINDS_[A-Z0-9_]+$/.test(message)?message:
      "AUTOMATED_FINDS_SIGNED_ARCHIVE_PUBLICATION_UNAVAILABLE";
    console.error("::error::"+reason);
  }
}


// One bounded, metadata-only D1 readback after publishing. The original URLs
// remain EPHEMERAL in this process, and the matrix prints only public opaque
// story IDs, original dates, and verification status. Never print or persist
// privateOriginals, issuer labels, raw headlines or article URLs. The free
// newsroom continues even when this optional trace cannot recover its source.
try {
  const reply=await fetch(
    "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news",{
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
  console.log(JSON.stringify({
    schema:"geomacro.private-derived-original-crosswalk-status.v1",
    checked_at:new Date(now).toISOString(),recent_count:recent.length,
    matched_ephemeral_originals:rows.filter(r=>r.source_original_reference_recovered).length,
    rows,raw_source_content_logged:false,source_urls_logged:false,
    persisted_original_urls:false,commercially_authorizing:false,
  }));
} catch {
  console.log(JSON.stringify({
    schema:"geomacro.private-derived-original-crosswalk-status.v1",
    status:"UNAVAILABLE_NO_EVIDENCE_PROMOTION",
    raw_source_content_logged:false,commercially_authorizing:false,
  }));
}
