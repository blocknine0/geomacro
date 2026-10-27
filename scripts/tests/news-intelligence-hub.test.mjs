import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateNewsHubTopology} from "../ops/verify-news-intelligence-hub-topology.mjs";
import {assembleNewsHubReceipt} from "../ops/verify-news-hub-live-bundle.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const fromRepo=p=>readFileSync(resolve(root,p),"utf8");
test("five group single-hub topology is connected to existing implementation",()=>{
 const r=validateNewsHubTopology();
 assert.equal(r.static_contract_valid,true);
 assert.equal(r.groups.length,5);
 assert.equal(r.actual_live_collection_verified,false);
 assert.equal(r.source_coverage_195x3_verified,false);
});
test("source markers cannot silently disappear",()=>{
 assert.throws(()=>validateNewsHubTopology(p=>
   p===".github/workflows/private-global-osint-15m.yml"?"on: workflow_dispatch":fromRepo(p)),
   /NEWS_HUB_WORKFLOW_DRIFT/);
});
test("explicitly false native global coverage cannot be laundered into true",()=>{
 assert.throws(()=>validateNewsHubTopology(p=>{
  const content=fromRepo(p);
  return p==="config/news-intelligence-hub.json"
   ?content.replace('"all_195x3_native_news_verified": false','"all_195x3_native_news_verified": true')
   :content;
 }),/NEWS_HUB_SAFETY_DRIFT/);
});
const categories={geopolitics:{stored_72h:3},macro:{stored_72h:2},rare_earth:{stored_72h:1}};
const counts={geopolitics:3,macro:2,rare_earth:1};
const coverage={live_response_valid:true,returned_cells:585,country_routes:195,
 category_routes:3,observed_country_category_cells:42,cells_without_matching_derivation:543,
 observed_journal_records_by_category:counts};
test("one receipt covers website, shared machine ids and accurate missing cells",()=>{
 const r=assembleNewsHubReceipt({verified:true,categories},
   {same_journal_ids_verified:true,counts},coverage,new Date("2026-10-27T00:00:00Z"));
 assert.equal(r.country_category_cells,585);
 assert.equal(r.cells_without_observed_country_mentions,543);
 assert.equal(r.commercial_rights_verified,false);
 assert.equal(r.additional_direct_d1_writes,0);
});
test("reject machine projections larger than journal",()=>{
 assert.throws(()=>assembleNewsHubReceipt({verified:true,categories},
  {same_journal_ids_verified:true,counts:{...counts,macro:5}},coverage),
 /NEWS_HUB_MACHINE_PROJECTION_EXCEEDS_JOURNAL/);
});
