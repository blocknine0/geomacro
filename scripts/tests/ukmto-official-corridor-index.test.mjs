import test from "node:test";
import assert from "node:assert/strict";
import {UKMTO_PUBLIC_INCIDENTS_URL,inspectUkmtoPublicIncidentIndex,observeUkmtoOfficialIndex} from "../lib/ukmto-official-corridor-index.mjs";
const now=new Date("2026-10-20T07:00:00Z");
const page=(text)=>"<!doctype html><html><main><h1>Recent Incidents</h1>"+text+"</main></html>";
const item=(id,date,description)=>"<section><h3>Attack UKMTO #"+id+
  "</h3><div>Image"+date+"</div><p>"+description+"</p></section>";
test("UKMTO index-only candidate routes are source-private, unverified and noncommercial",()=>{
 const x=inspectUkmtoPublicIncidentIndex(page(
  item(177,"18 October 2026","Strait of Hormuz, tanker approached outside Khor Fakkan")+
  item(176,"17 October 2026","Gulf of Aden south of Al Mukalla, Yemen")+
  item(175,"16 October 2026","al mukha and southern Red Sea") ),now);
 assert.equal(x.status,"RECENT_INDEX_CONTEXT_OBSERVED");
 assert.equal(x.parsed_unique_index_report_ids,3);
 assert.equal(x.index_reports_with_valid_display_date,3);
 assert.equal(x.recent_index_report_candidates,3);
 assert.deepEqual(x.candidate_corridor_ids,["bab_el_mandeb","gulf_of_aden_somali_basin","strait_of_hormuz"]);
 assert.equal(x.first_party_article_original_verified,false);
 assert.equal(x.reported_incident_independently_verified,false);
 assert.equal(x.commercial_rights_verified,false);
 assert.equal(x.partner_or_paid_delivery_enabled,false);
 assert.equal(x.d1_writes,0);
 assert.ok(!JSON.stringify(x).includes("tanker approached"));
});
test("empty/dynamic page, stale/future/index-only content fail closed",()=>{
 const empty=inspectUkmtoPublicIncidentIndex(page("<p>0 reports</p><p>UKMTO</p>"),now);
 assert.equal(empty.status,"NO_PARSEABLE_PUBLIC_REPORTS");
 const stale=inspectUkmtoPublicIncidentIndex(page(
  item(120,"11 August 2026","Strait of Hormuz")+
  item(178,"21 October 2026","Gulf of Aden")),now);
 assert.equal(stale.status,"NO_RECENT_DATED_REPORTS");
 assert.deepEqual(stale.candidate_corridor_ids,[]);
 assert.throws(()=>inspectUkmtoPublicIncidentIndex("<html>Blocked</html>",now),/UKMTO_INDEX_FORMAT_UNVERIFIED/);
 assert.throws(()=>inspectUkmtoPublicIncidentIndex(page("UKMTO"),new Date("invalid")),/UKMTO_CLOCK_INVALID/);
});
test("scripts, duplicate ids, HTML entities and invalid display dates never inflate candidates",()=>{
 const x=inspectUkmtoPublicIncidentIndex(page(
  "<script>UKMTO #199 Image19 October 2026 Strait of Hormuz</script>"+
  "<style>UKMTO #198 Image19 October 2026 Gulf of Aden</style>"+
  item(177,"18 October 2026","Suez Canal")+
  item(177,"18 October 2026","Strait of Hormuz")+
  item(176,"32 October 2026","Red Sea")),now);
 assert.equal(x.parsed_unique_index_report_ids,2);
 assert.equal(x.recent_index_report_candidates,1);
 assert.deepEqual(x.candidate_corridor_ids,["suez_canal"]);
});
test("bounded HTTPS source check refuses provider 403, future clock, oversize",async()=>{
 let requests=0,seen;
 const data=await observeUkmtoOfficialIndex({now,fetchImpl:async(url,opts)=>{
   requests++;seen={url,opts};return new Response(page(item(177,"18 October 2026","Strait of Hormuz")));
 }});
 assert.equal(data.recent_index_report_candidates,1);
 assert.equal(requests,1);
 assert.equal(seen.url,UKMTO_PUBLIC_INCIDENTS_URL);
 assert.equal(seen.opts.redirect,"error");
 assert.equal(seen.opts.method,"GET");
 await assert.rejects(()=>observeUkmtoOfficialIndex({now,fetchImpl:async()=>new Response("blocked",{status:403})}),/UKMTO_DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeUkmtoOfficialIndex({now,fetchImpl:async()=>new Response("a",{headers:{"content-length":"900000"}})}),/UKMTO_BODY_LIMIT/);
 await assert.rejects(()=>observeUkmtoOfficialIndex({now:new Date("invalid"),fetchImpl:async()=>{requests++;return new Response("x")}}),/UKMTO_CLOCK_INVALID/);
 assert.equal(requests,1);
});
