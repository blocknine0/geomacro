#!/usr/bin/env bun
// Production collector: registered sources -> one factual JSON -> protected
// Cloudflare D1 -> D1 readback. No raw source, premium, Supabase or x402.
import {createHmac} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {collectRegisteredReusableNews} from "../lib/registered-reusable-news-source-collector.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {countryMentionFromTitle} from "../lib/country-news-mentions-195.mjs";

const root=(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("REUSABLE_SOURCE_NEWS_PROTECTED_TOKEN_MISSING");
const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const endpoint="https://geomacro-control-plane.daspallab202391.workers.dev";
const collected=await collectRegisteredReusableNews({
  normalize:normalizeReusableNewsJson,
  resolveCountry:title=>countryMentionFromTitle(title,COUNTRIES_195),
});
const info=collected.summary;
if(collected.checks.length===0)throw Error("REUSABLE_SOURCE_NEWS_NO_ATTEMPTS");
const checks=[...collected.checks],items=[...collected.items];
const groups=[];
while(items.length||checks.length)groups.push({
  schema:collected.schema,items:items.splice(0,20),checks:checks.splice(0,16),
});
let checked=0,accepted=0,capacityExcluded=0;
for(const group of groups){
  const reply=await fetch(endpoint+"/v1/reusable-source-news",{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(group),signal:AbortSignal.timeout(15000),
  });
  if(reply.status!==200)throw Error("REUSABLE_SOURCE_NEWS_D1_WRITE_HTTP_"+reply.status);
  const body=await reply.json();
  if(body.ok!==true||body.d1_readback_verified!==true||
     body.accepted+body.capacity_excluded!==group.items.length||
     body.checked_sources!==group.checks.length||
     body.retention_hours!==25||
     body.raw_upstream_stored!==false||body.paid_product_authorized!==false)
    throw Error("REUSABLE_SOURCE_NEWS_D1_ACK_INVALID");
  accepted+=body.accepted;capacityExcluded+=body.capacity_excluded;
  checked+=body.checked_sources;
}
const status=await fetch(endpoint+"/v1/public/reusable-source-news",{
  method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json"},
  signal:AbortSignal.timeout(12000),
});
if(!status.ok)throw Error("REUSABLE_SOURCE_NEWS_PUBLIC_READ_UNAVAILABLE");
const publicBody=await status.json();
if(publicBody.schema!=="geomacro.reusable-source-news-feed.v1"||
   publicBody.window_hours!==25||
   publicBody.commercial_product_ready!==false||
   publicBody.public_raw_article_delivery!==false||
   !Array.isArray(publicBody.items))
  throw Error("REUSABLE_SOURCE_NEWS_PUBLIC_READ_CONTRACT_INVALID");
// A real downloadable JSON artifact is produced by the SAME authenticated
// D1-readback production run, even if Lovable has not published new code.
const complete=[...publicBody.items];
const ids=new Set(complete.map((x:any)=>x.id));
let cursor=publicBody.has_more?publicBody.next_offset:null;
while(cursor!==null){
  if(!Number.isSafeInteger(cursor)||cursor%200!==0||cursor<200||
     cursor>=4000)throw Error("REUSABLE_SOURCE_NEWS_PAGING_UNBOUNDED");
  const page=await fetch(endpoint+"/v1/public/reusable-source-news?offset="+cursor,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000),
  });
  if(!page.ok)throw Error("REUSABLE_SOURCE_NEWS_PAGE_READ_UNAVAILABLE");
  const doc=await page.json();
  if(doc.ok!==true||doc.schema!==publicBody.schema||
     doc.offset!==cursor||doc.window_hours!==25||
     !Array.isArray(doc.items)||doc.items.length>200||
     doc.commercial_product_ready!==false||doc.public_raw_article_delivery!==false)
    throw Error("REUSABLE_SOURCE_NEWS_PAGE_CONTRACT_INVALID");
  for(const row of doc.items){
    if(ids.has(row.id))throw Error("REUSABLE_SOURCE_NEWS_PAGE_ID_REPEATED");
    ids.add(row.id);complete.push(row);
  }
  cursor=doc.has_more?doc.next_offset:null;
}
const archive={...publicBody,offset:0,has_more:false,next_offset:null,
  page_size:complete.length,items:complete,
  artifact_scope:"BOUNDED_REGISTERED_SOURCE_FACTUAL_JSON_25H",
  snapshot_generated_at:new Date().toISOString()};
mkdirSync("artifacts/reusable-source-news",{recursive:true});
writeFileSync("artifacts/reusable-source-news/news.json",
  JSON.stringify(archive,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
  schema:"geomacro.source-news-json-production-run.v1",
  source_registry_endpoints:info.registered_source_endpoints,
  source_endpoints_selected:info.selected_source_endpoints,
  source_checks_persisted:checked,
  factual_json_rows_accepted:accepted,
  factual_json_rows_excluded_by_capacity:capacityExcluded,
  news_excluded_by_collector_capacity:info.excluded_by_collector_capacity,
  all_matching_items_captured_within_scanned_feeds:
    info.all_matching_items_captured_within_scanned_feeds&&capacityExcluded===0,
  rolling_database_retention_hours:25,
  source_states:info.source_states,
  d1_private_write_readback:true,public_api_readback:true,
  public_items_page_count:publicBody.items.length,
  original_page_verified:false,source_rights_commercial_authorized:false,
  paid_product_authorized:false,raw_upstream_stored:false,
}));
