import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planGlobalSearchTargets,supplementEmptyCells}
 from "../ops/supplement-hot50-global-search-facts.mjs";
import {generateProgressiveRiskGateDecision}
 from "../../workers/control-plane/src/progressive-risk-gate.mjs";
import {generateStoreProgressiveDecision,storeRiskGateD1}
 from "../../workers/control-plane/src/store-risk-gate.mjs";
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";

test("rotating bounded search plan reaches each Hot50 x three-category cell exactly once per sweep",()=>{
 const seen=new Set();
 for(let i=0;i<15;i++)for(const target of planGlobalSearchTargets(i*20*60_000,10)){
  const key=target.country_iso3+"|"+target.source_category;
  assert.equal(seen.has(key),false);
  seen.add(key);
 }
 assert.equal(seen.size,150);
 assert.equal(RISK_GATE_HOT50.length*3,150);
});

test("global search only supplements cells without recent direct originals and projects metadata only",async()=>{
 const selected=[
  {country_iso3:"USA",country_name:"United States",category:"macro",source_category:"MACRO_FX"},
  {country_iso3:"IND",country_name:"India",category:"geopolitics",source_category:"GEOPOLITICS"}
 ];
 let searches=0;const projected=[];
 const result=await supplementEmptyCells({targets:selected,now:Date.parse("2026-11-13T00:00:00Z"),
  hasFreshOriginal:async x=>x.country_iso3==="USA",
  search:async()=>{searches++;return {first_party_matches:[{
   original_title:"Central bank announces a new policy framework",
   original_url:"https://www.example.org/news/statement",
   original_published_at:"2026-11-12T21:00:00Z"
  }]};},
  project:async batch=>{projected.push(...batch);return {ok:true,accepted:batch.length,
   unverified_observations:batch.length,rights_verified:false,commercial_eligible:false,
   standard_corroboration_admitted:false};}
 });
 assert.equal(searches,1);
 assert.equal(result.cells_checked,2);
 assert.equal(result.global_searches,1);
 assert.equal(result.observations_projected,1);
 assert.equal(projected[0].country_iso3,"IND");
 assert.equal(projected[0].clock_basis,"INDEX_OBSERVED");
 assert.equal(projected[0].fact_basis,"SEARCH_TITLE_ONLY");
 assert.equal(projected[0].original_page_fetched,false);
 assert.equal(projected[0].rights_verified,false);
 assert.equal(projected[0].commercial_eligible,false);
 assert.equal(Object.hasOwn(projected[0],"original_title"),false);
});

test("scheduled global supplement is behind Workers Paid headroom and writes only through the metadata projection route",()=>{
 const workflow=readFileSync(".github/workflows/derived-risk-gate-discovery-20m.yml","utf8");
 const script=readFileSync("scripts/ops/supplement-hot50-global-search-facts.mjs","utf8");
 const headroom=workflow.indexOf("check-d1-paid-monthly-headroom.mjs --check");
 const runner=workflow.indexOf("supplement-hot50-global-search-facts.mjs",headroom);
 assert(headroom>=0&&runner>headroom);
 assert.match(script,/clock_basis:'INDEX_OBSERVED'/u);
 assert.match(script,/fact_basis:'SEARCH_TITLE_ONLY'/u);
 assert.match(script,/original_page_fetched:false/u);
 assert.match(script,/rights_verified:false,commercial_eligible:false/u);
 assert.match(script,/v1\/internal\/risk-gate\/progressive-observations/u);
 assert.doesNotMatch(script,/original_title\s*:/u);
});

test("Predge and Store adapter share the same facts-only tier generator; Store stays locked",async()=>{
 const parsed={request_id:"same-engine-test",subject:{type:"country",id:"IND"},
  policy:{policy_id:"test",policy_version:"1"}};
 const facts={distinct_events:1,corroboration_sources_count:1,
  standard_ready:false,category_coverage:["geopolitics"]};
 const partner=generateProgressiveRiskGateDecision(parsed,facts,"basic_focused",false,false,1_800_000_000_000);
 const store=generateStoreProgressiveDecision(parsed,facts,"basic_focused",false,false,1_800_000_000_000);
 assert.deepEqual(store,partner);
 const response=await storeRiskGateD1(new Request("https://example.test/v1/store/risk-gate",{
  method:"POST",headers:{"content-type":"application/json"},body:"{}"
 }),{});
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,"STORE_PAID_CHECKOUT_LOCKED");
 const source=readFileSync("workers/control-plane/src/predge-risk-gate-d1.mjs","utf8");
 const storeSource=readFileSync("workers/control-plane/src/store-risk-gate.mjs","utf8");
 const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
 assert.match(source,/generateProgressiveRiskGateDecision\(parsed,facts,lockedTier/u);
 assert.match(storeSource,/generateProgressiveRiskGateDecision\(parsed,facts,tier/u);
 assert.match(index,/url\.pathname==="\/v2\/partner\/predge\/paid-risk-gate"[\s\S]{0,80}predgePaidRiskGateD1/u);
 assert.match(index,/url\.pathname==="\/v1\/store\/risk-gate"[\s\S]{0,80}storeRiskGateD1/u);
 assert.match(source,/predge_paid_risk_gate_usage_ledger/u);
 assert.doesNotMatch(storeSource,/predge_paid_risk_gate_usage_ledger|paidScopeLockId|licensee:"predge"/u);
});
