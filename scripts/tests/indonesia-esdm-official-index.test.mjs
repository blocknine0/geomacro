import test from "node:test";
import assert from "node:assert/strict";
import {INDONESIA_ESDM_PRESS_INDEX_URL,inspectIndonesiaEsdmIndex,
 observeIndonesiaEsdmIndex} from "../lib/indonesia-esdm-official-index.mjs";
const now=new Date("2026-10-20T08:00:00Z");
const page=(press="Monday, 19 October 2026 Indonesia nickel and critical minerals policy updated")=>
 '<!DOCTYPE html><html><head><title>Ministry of Energy and Mineral Resources</title></head>'+
 '<body><h2>Kementerian Energi dan Sumber Daya Mineral</h2>'+
 '<h3>Recent News</h3>Monday, 19 October 2026 oil ministry news'+
 '<h3>Press Release</h3>'+press+
 '<h3>Key Reference</h3>13 October 2025 Rare Earth Minerals Research'+
 '<div>Historical dashboard 20 October 2026 nickel output</div></body></html>';
test("official ESDM pinned public HTTPS index, only press scoped dated mineral leads",()=>{
 assert.equal(new URL(INDONESIA_ESDM_PRESS_INDEX_URL).hostname,"www.esdm.go.id");
 const r=inspectIndonesiaEsdmIndex(page(),now);
 assert.equal(r.country_iso3,"IDN");
 assert.equal(r.status,"MINERAL_PRESS_INDEX_LEADS_OBSERVED");
 assert.equal(r.latest_candidate_index_day,"2026-10-19");
 assert.equal(r.mineral_topic_index_candidates_within_7d,1);
 assert.equal(r.first_party_article_original_verified,false);
 assert.equal(r.individual_item_native_timestamp_verified,false);
 assert.equal(r.observed_mine_supply_disruption_verified,false);
 assert.equal(r.customer_delivery_enabled,false);
 assert.equal(r.raw_html_stored,false);
 assert.doesNotMatch(JSON.stringify(r),/nickel and critical minerals policy updated/);
});
test("dashboard, navigation, old/unknown and future dates never become recent events",()=>{
 const normal=inspectIndonesiaEsdmIndex(page("Monday, 19 October 2026 Fuel distribution update"),now);
 assert.equal(normal.status,"OFFICIAL_PRESS_INDEX_READABLE_NO_MINERAL_LEADS");
 assert.equal(normal.mineral_topic_index_candidates_within_30d,0);
 assert.equal(inspectIndonesiaEsdmIndex(page("32 October 2026 nickel"),now).mineral_topic_index_candidates_within_30d,0);
});
test("no fake mineral lead from stale or future press dates",()=>{
 const future=inspectIndonesiaEsdmIndex(page("Wednesday, 21 October 2026 nickel policy"),now);
 assert.equal(future.mineral_topic_index_candidates_within_30d,0);
 const stale=inspectIndonesiaEsdmIndex(page("Monday, 19 August 2026 nickel policy"),now);
 assert.equal(stale.mineral_topic_index_candidates_within_30d,0);
});
test("denial, oversize and issuer mismatch fail closed",async()=>{
 assert.throws(()=>inspectIndonesiaEsdmIndex(page().replaceAll("Kementerian Energi dan Sumber Daya Mineral","Other").replace("Ministry of Energy and Mineral Resources","Other"),now),/PUBLISHER_UNVERIFIED/);
 let calls=0;const r=await observeIndonesiaEsdmIndex({now,fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url,INDONESIA_ESDM_PRESS_INDEX_URL);
  assert.equal(opts.redirect,"error");return new Response(page());
 }});
 assert.equal(calls,1);assert.equal(r.mineral_topic_index_candidates_within_7d,1);
 await assert.rejects(()=>observeIndonesiaEsdmIndex({now,fetchImpl:async()=>new Response("403",{status:403})}),/ESDM_DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeIndonesiaEsdmIndex({now,fetchImpl:async()=>new Response("long",{headers:{"content-length":"900000"}})}),/ESDM_BODY_LIMIT/);
});
