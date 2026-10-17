import {test} from "node:test";
import {strict as assert} from "node:assert";
import {summarizeDerivedSourceHealth,DERIVED_SOURCE_CATEGORIES} from "../lib/derived-news-source-health.mjs";
const lane=(index,ok,failure_class)=>({index,transport_ok:ok,failure_class});
test("hourly free source reports exactly three supported categories without granting commercial rights",()=>{
  assert.deepEqual(DERIVED_SOURCE_CATEGORIES,["geopolitics","macro","rare_earth"]);
  for(const category of DERIVED_SOURCE_CATEGORIES){
    const r=summarizeDerivedSourceHealth(category,2,2,[lane(0,true),lane(1,true)]);
    assert.equal(r.status,"ALL_CONFIGURED_FEEDS_REACHABLE");
    assert.equal(r.diagnostics_complete,true);
    assert.equal(r.commercial_rights_verified,false);
    assert.equal(r.raw_upstream_stored,false);
    assert.equal(r.sources_unavailable,0);
  }
});
test("a failing first-party lane is counted even when other sources continue",()=>{
  const r=summarizeDerivedSourceHealth("macro",4,2,[
    lane(0,false,"http_5xx"),lane(1,true),lane(2,false,"timeout"),lane(3,true),
  ]);
  assert.equal(r.status,"PARTIAL_SOURCE_DEGRADATION");
  assert.equal(r.sources_unavailable,2);
  assert.deepEqual(r.degraded_lane_indexes,[0,2]);
  assert.equal(r.failure_classes.http_5xx,1);
  assert.equal(r.failure_classes.timeout,1);
  assert.equal(JSON.stringify(r).includes("https://"),false);
  assert.equal(r.current_news_guaranteed,false);
});
test("all source failures or incomplete receipts never imply successful or licensed collection",()=>{
  const down=summarizeDerivedSourceHealth("rare_earth",2,0,[lane(0,false,"network"),lane(1,false)]);
  assert.equal(down.status,"ALL_SOURCES_UNAVAILABLE");
  assert.equal(down.failure_classes.unknown,1);
  assert.equal(down.diagnostics_complete,true);
  const incomplete=summarizeDerivedSourceHealth("geopolitics",3,2,[lane(0,true),lane(1,true)]);
  assert.equal(incomplete.status,"PARTIAL_SOURCE_DEGRADATION");
  assert.equal(incomplete.diagnostics_complete,false);
  assert.equal(incomplete.sources_unavailable,1);
});
test("source counters reject malformed, duplicate or invented lanes",()=>{
  assert.throws(()=>summarizeDerivedSourceHealth("illegal",1,1,[]),/INVALID/);
  assert.throws(()=>summarizeDerivedSourceHealth("macro",1,2,[]),/INVALID/);
  assert.throws(()=>summarizeDerivedSourceHealth("macro",1,0,[lane(0,false),lane(0,false)]),/LANE_INVALID/);
  assert.throws(()=>summarizeDerivedSourceHealth("macro",1,0,[lane(5,false)]),/LANE_INVALID/);
});
