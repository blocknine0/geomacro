/** Read-only probe of replacement URLs only. Never retry owner-removed feeds. */
import {writeFileSync} from "node:fs";
import {retiredSourceReplacements} from "../lib/retired-source-replacements.mjs";
import {collectRegisteredReusableNews} from "../lib/registered-reusable-news-source-collector.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {fetchPrivateFeedSafely} from "../lib/private-osint-15m-collector.mjs";

const sources=retiredSourceReplacements();
const now=new Date(),results=[];
// Serial admission checks respect shared publisher/CDN capacity. Production
// also serializes Euronews language hosts; no denial/rate-limit retries.
for(let start=0;start<sources.length;start++){
 const batch=await Promise.all(sources.slice(start,start+1).map(async source=>{
  const articles=new Set();
  let transportStatus=null,redirectHost=null;
  const receipt=await collectRegisteredReusableNews({
   now,registry:[source],normalize:normalizeReusableNewsJson,resolveCountry:()=>null,
   fetchImpl:async(url,options)=>{
    const response=await fetchPrivateFeedSafely(url,options,fetch);
    transportStatus=response.status;
    try{const location=response.headers.get("location");if(location)redirectHost=new URL(location,url).hostname}catch{}
    return response;
   },
   allowRdfNativeDates:true,maxFeedBytes:1024*1024,
   onOriginalCandidate:row=>articles.add(row.article_url),
  });
  return {source_id:source.id,replaces_retired_source_ids:source.replaces_retired_source_ids,
   states:[...new Set(receipt.checks.map(x=>x.state))],transport_status:transportStatus,
   rejected_redirect_host:redirectHost,native_72h_items:articles.size,
   current_transport_and_native_items_observed:articles.size>0,
   complete_exact_duplicate_coverage_verified:false};
 }));results.push(...batch);
}
const report={schema:"geomacro.retired-source-replacement-probe.v1",checked_at:now.toISOString(),
 source_endpoints_checked:sources.length,retired_endpoints_requested:0,
 d1_queries:0,d1_writes:0,b2_requests:0,public_news_published:false,
 complete_exact_duplicate_coverage_verified:false,results};
writeFileSync(process.env.GEOMACRO_REPLACEMENT_PROBE_OUTPUT??"/tmp/geomacro-source-replacement-probe.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
if(results.some(x=>!x.current_transport_and_native_items_observed))process.exitCode=1;
