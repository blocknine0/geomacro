import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {verifyNativeCorridorCandidates} from "./corridor-native-article-verification.mjs";
import {verifyCorridorReceipt} from "../ops/verify-private-corridor-article-evidence.mjs";

const now=new Date("2026-11-02T02:00:00.000Z");
const pub="2026-11-02T01:45:00.000Z";
const sha=s=>createHash("sha256").update(s).digest("hex");
const feeds={
 boe_news:"https://www.bankofengland.co.uk/rss/news",
 coindesk_rss:"https://www.coindesk.com/arc/outboundfeeds/rss/",
 cointelegraph_rss:"https://cointelegraph.com/rss"
};
function candidate(source_id,article_url,published_at=pub){
 return {id:sha(source_id+"\x1f"+article_url+"\x1f"+published_at),source_id,
  original_publisher_url:feeds[source_id],article_url,published_at,
  source_title_sha256:sha("Native title"),candidate_corridor_ids:[],
  source_time_is_not_event_time:true,corridor_impact_verified:false,
  original_article_verified:false,independent_corroboration_verified:false,
  commercial_rights_verified:false,customer_delivery_enabled:false};
}
const a=candidate("coindesk_rss","https://www.coindesk.com/business/route-incident-a");
const b=candidate("cointelegraph_rss","https://cointelegraph.com/news/route-incident-b");
const c=candidate("boe_news","https://www.bankofengland.co.uk/news/2026/november/monetary-policy");
const paragraph="A maritime update published today: ".repeat(4)+
 "The vessel IMO 1234567 was attacked while transiting the Strait of Hormuz, an event confirmed in this report. ";
const article='<html><body><header>Strait of Malacca closed</header>'+
 '<article><h1>News</h1><p>'+paragraph+'</p></article></body></html>';
const response=(body=article,status=200,contentType="text/html")=>
 new Response(body,{status,headers:{"content-type":contentType}});
test("same vessel, action, route on two publisher-native pages yields independent report match, never commercial event",async()=>{
 let calls=0;
 const result=await verifyNativeCorridorCandidates({candidates:[a,b],now,
  fetchImpl:async()=>{calls++;return response()}});
 assert.equal(calls,2);
 assert.equal(result.inspected_count,2);
 assert.equal(result.route_clause_observed,2);
 assert.equal(result.independent_vessel_route_matches,2);
 assert.equal(result.verified_corridor_events,0);
 assert.ok(result.items.every(x=>x.state==="INDEPENDENT_VESSEL_ROUTE_REPORT_MATCH"));
 assert.ok(result.items.every(x=>x.event_verified===false&&x.corridor_impact_verified===false));
 assert.ok(result.items.every(x=>x.route_context_ids.includes("strait_of_hormuz")));
 assert.ok(result.items.every(x=>!Object.hasOwn(x,"article_url")));
 assert.ok(!JSON.stringify(result).includes("IMO 1234567"));
 assert.ok(!JSON.stringify(result).includes("The vessel"));
});
test("one publisher report and generic monetary policy article do not confirm event",async()=>{
 const result=await verifyNativeCorridorCandidates({candidates:[a,c],now,
  fetchImpl:async input=>String(input)===a.article_url?response():response(
   "<html><main><p>"+("Monetary policy rate decision. ".repeat(15))+"</p></main></html>")});
 assert.equal(result.independent_vessel_route_matches,0);
 assert.equal(result.items[0].state,"SINGLE_SOURCE_ROUTE_CLAUSE_OBSERVED");
 assert.equal(result.items[1].state,"ARTICLE_BODY_READ");
 assert.equal(result.verified_corridor_events,0);
});
test("headers, navigation and simple route headlines are not event evidence",async()=>{
 const html="<html><header>IMO 1234567 attacked in Strait of Hormuz</header>"+
  "<main><nav>IMO 1234567 attacked in Strait of Hormuz</nav>"+
  "<p>Ordinary monetary news. ".repeat(10)+"</p></main></html>";
 const res=await verifyNativeCorridorCandidates({candidates:[a],now,
  fetchImpl:async()=>response(html)});
 assert.equal(res.route_clause_observed,0);
 assert.equal(res.independent_vessel_route_matches,0);
});
test("denial, redirect, non-HTML and oversized body are fail-closed",async()=>{
 for(const f of [
  async()=>response("",403),
  async()=>response("{}",200,"application/json"),
  async()=>response("X".repeat(160*1024+1)),
  async()=>{throw Error("network")} ]){
  const r=await verifyNativeCorridorCandidates({candidates:[a],now,fetchImpl:f});
  assert.equal(r.article_body_reads,0);
  assert.equal(r.verified_corridor_events,0);
 }
});
test("no unsafe URLs, spoofed hashes, unsupported clients or unverified claims accepted",async()=>{
 for(const patch of [
  {article_url:"http://www.coindesk.com/news/a"},
  {article_url:"https://evil.example.org/a"},
  {article_url:"https://www.coindesk.com/a?tracking=1"},
  {id:"a".repeat(64)},
  {commercial_rights_verified:true},
  {corridor_impact_verified:true},
  {published_at:"2026-10-01T01:45:00.000Z"}
 ]){
  await assert.rejects(()=>verifyNativeCorridorCandidates({candidates:[{...a,...patch}],now,
   fetchImpl:async()=>response()}),/CORRIDOR_ARTICLE_VERIFIER_INPUT_INVALID/);
 }
});
test("bounded selection handles 30+ candidates without additional D1 or raw feed requests",async()=>{
 const batch=Array.from({length:31},(_,i)=>candidate("coindesk_rss",
  "https://www.coindesk.com/business/test-"+i));
 let calls=0;
 const r=await verifyNativeCorridorCandidates({candidates:batch,now,
  maxPerRun:24,concurrency:3,fetchImpl:async()=>{calls++;return response()}});
 assert.equal(calls,24);
 assert.equal(r.deferred_count,7);
 assert.equal(r.d1_reads,0);
 assert.equal(r.d1_writes,0);
 assert.equal(r.b2_requests,0);
 assert.equal(r.verified_corridor_events,0);
});
test("runner requires correct input cohort receipt and never upgrades payability",async()=>{
 const receipt={schema:"geomacro.corridor-native-news-candidates.v1",
  channel:"CORRIDOR_ONLY",checked_at:"2026-11-02T01:45:00.000Z",
  source_count:37,native_news_sources_polled:6,
  candidate_count:1,news_candidates:[a],commercial_rights_verified:false,
  website_intelligence_enabled:false};
 const res=await verifyCorridorReceipt({receipt,now,fetchImpl:async()=>response()});
 assert.equal(res.inspected_count,1);
 assert.equal(res.chargeable,false);
 await assert.rejects(()=>verifyCorridorReceipt({receipt:{...receipt,commercial_rights_verified:true},
  now,fetchImpl:async()=>response()}),/CORRIDOR_VERIFICATION_RECEIPT_INVALID/);
});

test("route mention without IMO is automatically flagged as context, not incident",async()=>{
 const html="<html><article><p>"+("Operational summary. ".repeat(15))+
  "Navigation authorities referenced the Suez Canal in regional freight analysis, with no verified disruption."+
  "</p></article></html>";
 const r=await verifyNativeCorridorCandidates({candidates:[a],now,fetchImpl:async()=>response(html)});
 assert.equal(r.body_route_mentions,1);
 assert.equal(r.route_clause_observed,0);
 assert.equal(r.items[0].state,"ARTICLE_ROUTE_CONTEXT_ONLY");
 assert.deepEqual(r.items[0].route_context_ids,["suez_canal"]);
 assert.equal(r.items[0].event_verified,false);
});


test("earliest same-event publisher timestamp becomes structured operational event reference, not physical occurrence",async()=>{
 const early=candidate("coindesk_rss","https://www.coindesk.com/business/ship-early",
   "2026-11-02T01:05:00.000Z");
 const late=candidate("cointelegraph_rss","https://cointelegraph.com/news/ship-late",
   "2026-11-02T01:45:00.000Z");
 const r=await verifyNativeCorridorCandidates({candidates:[late,early],now,
  fetchImpl:async()=>response()});
 assert.equal(r.independent_vessel_route_matches,2);
 assert.equal(r.items.length,2);
 for(const row of r.items){
  assert.equal(row.event_reference_at,"2026-11-02T01:05:00.000Z");
  assert.equal(row.event_reference_time_basis,"EARLIEST_CORROBORATING_PUBLICATION");
  assert.equal(row.physical_occurrence_time_verified,false);
  assert.equal(row.raw_article_used_for_structuring,true);
  assert.equal(row.structured_evidence.length,1);
  assert.equal(row.structured_evidence[0].route_id,"strait_of_hormuz");
  assert.equal(row.structured_evidence[0].action,"attack");
  assert.equal(row.structured_evidence[0].independent_issuer_count,2);
  assert.equal(row.structured_evidence[0].physical_occurrence_time_verified,false);
  assert.match(row.structured_evidence[0].vessel_token_hash,/^[a-f0-9]{64}$/);
 }
 assert.equal(r.verified_corridor_events,0);
 assert.ok(!JSON.stringify(r).includes("IMO 1234567"));
 assert.ok(!JSON.stringify(r).includes("vessel IMO"));
 assert.ok(!JSON.stringify(r).includes("ship-early"));
 assert.equal(r.source_article_bodies_saved,false);
 assert.equal(r.raw_articles_structured_ephemerally,true);
});
test("unrelated earlier publisher report never overrides an incident's observed reference time",async()=>{
 const sameLate=candidate("coindesk_rss","https://www.coindesk.com/business/ship-late",
  "2026-11-02T01:30:00.000Z");
 const sameOther=candidate("cointelegraph_rss","https://cointelegraph.com/news/ship-other",
  "2026-11-02T01:45:00.000Z");
 const unrelatedEarly=candidate("boe_news","https://www.bankofengland.co.uk/news/earlier",
  "2026-11-02T00:30:00.000Z");
 const r=await verifyNativeCorridorCandidates({candidates:[sameLate,sameOther,unrelatedEarly],now,
  fetchImpl:async url=>url===unrelatedEarly.article_url?
   response("<html><article><p>"+("Policy context only. ".repeat(14))+"</p></article></html>"):
   response()});
 const relevant=r.items.filter(x=>x.independent_report_match);
 assert.equal(relevant.length,2);
 assert.ok(relevant.every(x=>x.event_reference_at==="2026-11-02T01:30:00.000Z"));
 const other=r.items.find(x=>x.source_id==="boe_news");
 assert.equal(other.event_reference_at,"2026-11-02T00:30:00.000Z");
 assert.equal(other.extracted_context_class,"NO_ROUTE_EVIDENCE");
});
test("raw article body can inform source-structured route context without inventing an incident",async()=>{
 const context="<html><main><p>"+("Market logistics and freight context. ".repeat(12))+
  "The Suez Canal is mentioned as a regional shipping corridor, with no incident verified."+
  "</p></main></html>";
 const r=await verifyNativeCorridorCandidates({candidates:[a],now,
  fetchImpl:async()=>response(context)});
 assert.equal(r.items[0].extracted_context_class,"ROUTE_MENTION_ONLY");
 assert.equal(r.items[0].event_reference_at,pub);
 assert.equal(r.items[0].physical_occurrence_time_verified,false);
 assert.equal(r.items[0].raw_article_used_for_structuring,true);
 assert.deepEqual(r.items[0].route_context_ids,["suez_canal"]);
 assert.equal(r.items[0].structured_evidence.length,0);
 assert.equal(r.verified_corridor_events,0);
 assert.ok(!JSON.stringify(r).includes("freight context"));
});
