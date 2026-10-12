#!/usr/bin/env bun
/**
 * Free original-publisher release -> only Geomacro-owned structured cards -> D1.
 * Never persists or prints raw upstream titles, provider IDs, URLs, feed XML,
 * origin article bodies, raw-article fingerprints, payment data or GRO scores.
 * GitHub schedule is best effort; website also does live on-demand reads.
 */
import { createHmac } from "node:crypto";
import { readStatelessWebsiteIntelligence } from "../../src/lib/stateless-public-intelligence.server";
import { conservativeDayReleaseMs } from "../../src/lib/stateless-intelligence-model";

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
for (const category of categories) {
  try {
    const report=await readStatelessWebsiteIntelligence(category);
    if (report.healthy_feed_count === 0) throw Error("OFFICIAL_FEEDS_UNREACHABLE");
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
    console.error("::error::WEBSITE_DERIVED_NEWS_INGEST_"+category.toUpperCase()+"_UNAVAILABLE");
  }
}
if (denied!==0||!success) process.exitCode=2;
