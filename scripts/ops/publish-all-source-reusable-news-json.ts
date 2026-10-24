#!/usr/bin/env bun
// Production collector: registered sources -> one factual JSON -> protected
// Cloudflare D1 -> D1 readback. No raw source, premium, Supabase or x402.
import {createHmac} from "node:crypto";
import {collectRegisteredReusableNews} from "../lib/registered-reusable-news-source-collector.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";

const root=(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)throw Error("REUSABLE_SOURCE_NEWS_PROTECTED_TOKEN_MISSING");
const token=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
const endpoint="https://geomacro-control-plane.daspallab202391.workers.dev";
const collected=await collectRegisteredReusableNews({normalize:normalizeReusableNewsJson});
const info=collected.summary;
if(collected.checks.length===0)throw Error("REUSABLE_SOURCE_NEWS_NO_ATTEMPTS");
const checks=[...collected.checks],items=[...collected.items];
const groups=[];
while(items.length||checks.length)groups.push({
  schema:collected.schema,items:items.splice(0,20),checks:checks.splice(0,16),
});
let checked=0,accepted=0;
for(const group of groups){
  const reply=await fetch(endpoint+"/v1/reusable-source-news",{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(group),signal:AbortSignal.timeout(15000),
  });
  if(reply.status!==200)throw Error("REUSABLE_SOURCE_NEWS_D1_WRITE_HTTP_"+reply.status);
  const body=await reply.json();
  if(body.ok!==true||body.d1_readback_verified!==true||
     body.accepted!==group.items.length||body.checked_sources!==group.checks.length||
     body.raw_upstream_stored!==false||body.paid_product_authorized!==false)
    throw Error("REUSABLE_SOURCE_NEWS_D1_ACK_INVALID");
  accepted+=body.accepted;checked+=body.checked_sources;
}
const status=await fetch(endpoint+"/v1/public/reusable-source-news",{
  method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json"},
  signal:AbortSignal.timeout(12000),
});
if(!status.ok)throw Error("REUSABLE_SOURCE_NEWS_PUBLIC_READ_UNAVAILABLE");
const publicBody=await status.json();
if(publicBody.schema!=="geomacro.reusable-source-news-feed.v1"||
   publicBody.commercial_product_ready!==false||
   publicBody.public_raw_article_delivery!==false||
   !Array.isArray(publicBody.items))
  throw Error("REUSABLE_SOURCE_NEWS_PUBLIC_READ_CONTRACT_INVALID");
console.log(JSON.stringify({
  schema:"geomacro.source-news-json-production-run.v1",
  source_registry_endpoints:info.registered_source_endpoints,
  source_endpoints_selected:info.selected_source_endpoints,
  source_checks_persisted:checked,
  factual_json_rows_accepted:accepted,
  source_states:info.source_states,
  d1_private_write_readback:true,public_api_readback:true,
  public_items_page_count:publicBody.items.length,
  original_page_verified:false,source_rights_commercial_authorized:false,
  paid_product_authorized:false,raw_upstream_stored:false,
}));
