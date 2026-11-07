import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildDirect20mSourceHealthProof}
 from "../lib/direct20m-source-health-proof.mjs";
import {inspectHot50ActualSourceHealth,inspectHot50ScheduledRun}
 from "../ops/verify-hot50-continuity-run.mjs";
import {createHash} from "node:crypto";
const now=Date.parse("2026-11-07T12:30:00Z");
const registry=[
 {id:"official_geo",url:"https://geo.example.gov/feed",categories:["geopolitics"]},
 {id:"official_macro",url:"https://macro.example.gov/feed",categories:["macro"]},
 {id:"official_minerals",url:"https://minerals.example.gov/feed",categories:["rare_earth"]}
];
const checks=registry.map(x=>({
 source_ref:createHash("sha256").update(
  [x.id,x.url,x.categories[0]].join("\n")).digest("hex"),
 state:x.categories[0]==="macro"?"DENIED":"OBSERVED"
}));
const proof=buildDirect20mSourceHealthProof({registry,checks,
 observedCandidates:null,retainedCandidates:null,now});
test("genuine three-category source sweep is accepted even when some publishers deny; no fabricated originals",()=>{
 const r=inspectHot50ActualSourceHealth(proof,{mode:"HELD",now});
 assert.equal(r.accepted,true);
 assert.equal(r.source_transport_attempted,true);
 assert.equal(r.d1_originals_readback_verification,false);
 assert.equal(r.b2_physical_parity_proven,false);
 assert.equal(r.signed_risk_gate_150_cells_proven,false);
 assert.equal(r.payments_enabled,false);
 assert.equal(r.source_content_logged,false);
 assert.deepEqual(r.categories_with_runtime_checks,["geopolitics","macro","rare_earth"]);
 assert.equal(Object.hasOwn(r,"sources"),false);
});
test("missing, stale, incomplete, forged source receipts cannot produce green collector",()=>{
 for(const change of [
 {schema:"geomacro.unknown"},
 {checked_at:"2026-11-07T11:00:00Z"},
 {category_checks_with_runtime_state:0},
 {sources:proof.sources.slice(0,2)},
 {original_article_urls_included:true},
 {source_endpoints_configured:0},
 {sources:proof.sources.map((x,i)=>i===0?{...x,url:"https://secret"}:x)},
 {sources:proof.sources.map((x,i)=>i===0?{...x,transport_parser_state:"NOT_CHECKED"}:x)},
 {d1_selected_batch_readback_verified:true}
 ])assert.equal(inspectHot50ActualSourceHealth({...proof,...change},{mode:"HELD",now}).accepted,false);
 assert.equal(inspectHot50ActualSourceHealth(proof,{mode:"OTHER",now}).accepted,false);
});
test("non-vacuous scheduled success requires exactly one actual admitted or encrypted HELD sweep",()=>{
 const build=(admitted,held,quota="success",contract="success")=>({
  "source-contract":{result:contract},"quota-admission":{result:quota},
  "collect-direct-20m":{result:admitted},
  "encrypted-held-three-domain-20m":{result:held}
 });
 for(const p of [
  [build("success","skipped"),"ADMITTED"],
  [build("skipped","success"),"HELD"],
  [build("failure","success"),"HELD"],
  [build("skipped","success","failure"),"HELD"],
  [build("skipped","success","skipped"),"HELD"]
 ]){
  const actual=inspectHot50ScheduledRun(p[0],{event:"schedule"});
  assert.equal(actual.accepted,true);
  assert.equal(actual.executed_lane,p[1]);
 }
 for(const bad of [
  build("skipped","skipped"),build("success","success"),
  build("failure","failure"),build("success","skipped","failure"),
  build("skipped","skipped","skipped"),
  build("skipped","skipped","skipped"),build("skipped","success","success","failure")
 ])assert.equal(inspectHot50ScheduledRun(bad,{event:"schedule"}).accepted,false);
 assert.equal(inspectHot50ScheduledRun(build("success","skipped"),{event:"push"}).accepted,false);
});
test("production final check is scoped to 20-minute schedule and cannot claim green just from a push job",()=>{
 const wf=readFileSync(new URL(
  "../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url),"utf8");
 const step=wf.indexOf("runtime-source-sweep-acceptance:");
 assert.ok(step>0);
 const section=wf.slice(step);
 assert.ok(section.includes("always()"));
 assert.ok(section.includes("needs: [source-contract, quota-admission, collect-direct-20m, encrypted-held-three-domain-20m]"));
 assert.ok(section.includes("node scripts/ops/verify-hot50-continuity-run.mjs --scheduled-run"));
 assert.ok(section.includes("github.event_name == 'schedule'"));
 assert.ok(wf.includes("node scripts/ops/verify-hot50-continuity-run.mjs --source-health"));
 assert.ok(wf.includes("scripts/tests/hot50-continuity-runtime.test.mjs"));
 assert.ok(wf.includes('cron: "6,26,46 * * * *"'));
 assert.ok(!wf.includes("d1 time-travel restore"));
});
