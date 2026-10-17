import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assemblePrivateIntakeSnapshot}
  from "../ops/assemble-private-all-source-intake.mjs";
import {PUBLIC_FEED_ROTATION}
  from "../ops/observe-operator-free-feed-rotation.mjs";
import {auditGeomacro1059FeedActivation}
  from "./geomacro-feed-activation-ledger.mjs";
const load=s=>JSON.parse(readFileSync(s,"utf8"));
const now=new Date("2026-10-13T14:00:00.000Z");
const operatorCatalog=load("config/operator-76-source-attribution-intake.v1.json");
const inventory=assemblePrivateIntakeSnapshot({
  core:load("global-intelligence/sources/source-registry.v1.json"),
  free:load("global-intelligence/sources/free-source-catalog.v1.json"),
  roots:load("config/telegram-discovery-roots.json"),
  telegram:load("config/private-intake-telegram-sanitary-pin.v1.json"),
  historical:load("config/private-intake-historical-sanitary-pin.v1.json"),
  operator76:operatorCatalog,
  countrySources:load("config/operator-country-source-crosswalk.v1.json"),
  corridorSources:load("config/operator-corridor-source-crosswalk.v1.json"),
},now);
function groupReceipt(group){
  const sources=PUBLIC_FEED_ROTATION.filter(x=>x.group===group).map(feed=>{
    const source=operatorCatalog.entries.find(x=>x.id===feed.id);
    const xml=feed.format==="xml";
    return {
      id:feed.id,source_name:source.attribution.source_name,
      domains:source.domains,rights_status:"REQUIRES_EXACT_DATASET_COMMERCIAL_REVIEW",
      transport_state:feed.format==="html"?"HTML_HEALTH_ONLY":"LIVE_PRIVATE_METADATA",
      request_attempted:true,http_requests:1,
      sampled_metadata_items:xml?15:feed.format==="json"?2:0,
      native_dated_24h_items:xml?3:null,
      timestamp_precision:xml?
        "FEED_ITEM_DATE_NOT_ORIGINAL_PUBLISHER_PAGE_VALIDATION":
        feed.format==="json"?"BLS_PUBLIC_V1_REFERENCE_PERIOD_NOT_PUBLICATION_TIME":
        "HTML_TRANSPORT_ONLY_NO_EVENT_EXTRACTION",
      independent_event_corroboration:false,source_rights_verified_for_commerce:false,
      original_page_publication_verified:false,customer_raw_data_delivered:false,
      current_scored_intelligence_verified:false,signed_gro:false,commercial_eligible:false,
    };
  });
  return {
    schema:"geomacro.operator-free-rotating-private-feed-metadata.v1",
    checked_at:"2026-10-13T13:55:00.000Z",
    group,groups_total:3,source_count:sources.length,
    http_requests:sources.length,sources,
    raw_publisher_payload_persisted:false,signed_gro_generated:false,
    supabase_requests:0,b2_requests:0,d1_requests:0,payments:0,
  };
}
const receipts=[0,1,2].map(groupReceipt);
const run=(input=receipts,override={})=>
  auditGeomacro1059FeedActivation({
    inventory,operatorCatalog,rotationReceipts:input,now,...override,
  });

test("real 1059 category-reference registry vs exactly 8 unique plausible XML feed transports, never fake 80%",()=>{
  const out=run();
  assert.equal(inventory.sources_catalogued,1059);
  assert.deepEqual(Object.keys(out.per_domain).sort(),
    ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].sort());
  assert.equal(out.per_domain.GEOPOLITICS.catalogued,467);
  assert.equal(out.per_domain.MACRO.catalogued,459);
  assert.equal(out.per_domain.CRITICAL_MINERALS.catalogued,133);
  assert.equal(out.requested_active_feed_target_80pct,848);
  assert.equal(out.distinct_xml_feed_candidates_configured,8);
  assert.equal(out.distinct_other_api_or_html_candidates_configured,2);
  assert.equal(out.distinct_live_xml_feed_transports_proven,8);
  assert.equal(out.complete_operator_xml_probe_rotation,true);
  assert.equal(out.existing_reference_semantics_allow_80pct,false);
  assert.equal(out.catalog_references_not_independent_feeds_at_baseline,419);
  assert.equal(out.max_convertible_reference_slots_without_catalog_reclassification,640);
  assert.equal(out.missing_physical_live_feed_target_count,840);
  assert.equal(out.all_catalogued_entries_are_active_feeds,false);
  assert.equal(out.x402_payment_authorized,false);
  assert.deepEqual([out.b2_requests,out.d1_writes,out.supabase_requests,out.payments],[0,0,0,0]);
  const rendered=JSON.stringify(out);
  for(const raw of ["aljazeera","federalreserve","rss.dw","fed_press",
    "source_ref","source_id","operator76","https://"])
    assert.equal(rendered.includes(raw),false);
});
test("one group is an incomplete observation; older unpublished feeds never become fresh events",()=>{
  const r=groupReceipt(1);
  r.sources.forEach(s=>s.native_dated_24h_items=0);
  const out=run([r]);
  assert.equal(out.observed_rotating_groups,1);
  assert.equal(out.complete_operator_xml_probe_rotation,false);
  assert.equal(out.distinct_live_xml_feed_transports_proven,4);
  assert.equal(out.per_domain.GEOPOLITICS.feed_native_24h_reference_slots,0);
  assert.equal(out.first_party_original_publication_verified,false);
});
test("an HTTP 429 or unparsed RSS is not an active feed transport, not retried or commercialized",()=>{
  const batch=groupReceipt(1);
  batch.sources[0].transport_state="DENIED_OR_RATE_LIMIT";
  batch.sources[0].sampled_metadata_items=0;
  batch.sources[0].native_dated_24h_items=0;
  const out=run([batch]);
  assert.equal(out.distinct_live_xml_feed_transports_proven,3);
  assert.equal(out.missing_physical_live_feed_target_count,845);
  assert.equal(out.provider_commercial_use_verified,false);
});
test("spurious activated Telegram/historical/held provider and mismatched source IDs cannot count",()=>{
  const fake=groupReceipt(1);
  const attempts=[
    {...fake,sources:fake.sources.map((row,i)=>i===0?{...row,id:"telegram_hijack"}:row)},
    {...fake,source_count:99},
    {...fake,http_requests:99},
    {...fake,payments:1},
    {...fake,sources:fake.sources.map((row,i)=>i===0?{...row,commercial_eligible:true}:row)},
    {...fake,sources:fake.sources.map((row,i)=>i===0?{...row,signed_gro:true}:row)},
    {...fake,sources:fake.sources.map((row,i)=>i===0?{...row,native_dated_24h_items:900}:row)},
    {...fake,checked_at:"2026-10-12T00:00:00.000Z"},
  ];
  for(const bad of attempts)
    assert.throws(()=>run([bad]),/GEOMACRO_ACTIVATION_PROOF_INVALID/);
  assert.throws(()=>run([fake,fake]),/GEOMACRO_ACTIVATION_PROOF_INVALID/);
  const banned={
    ...operatorCatalog,
    entries:operatorCatalog.entries.map(item=>item.id==="news_aljazeera"?
      {...item,runtime_state:"HOLD_PAID_OR_NONCOMMERCIAL"}:item),
  };
  assert.throws(()=>run([fake],{operatorCatalog:banned}),
    /GEOMACRO_ACTIVATION_PROOF_INVALID/);
});
