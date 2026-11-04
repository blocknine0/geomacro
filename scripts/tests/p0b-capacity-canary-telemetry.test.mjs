import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const workflow=readFileSync(new URL(
 "../.github/workflows/p0b-production-parity-hourly.yml",import.meta.url),"utf8");
const m=/printf '%s' "\$CANARY" \| jq -c '([\s\S]*?)'\n\s*printf '%s' "\$CANARY" \| jq -e/u.exec(workflow);
const extract=source=>{
 assert.ok(m,"pinned actual production canary jq receipt must exist");
 const r=spawnSync("jq",["-c",m[1]],{input:JSON.stringify(source),
  encoding:"utf8",timeout:10000,maxBuffer:50000});
 assert.equal(r.status,0,r.stderr);
 return JSON.parse(r.stdout);
};
test("live source canary reports exact known B2 failure enums as counts only",()=>{
 const observed=extract({ok:true,due_selected:3,receipts:[
  {state:"CAPACITY_DEFERRED",accepted:0,
   p0b_failure_codes:{P0B_B2_PUT_TRANSPORT_UNAVAILABLE:3},
   title:"SECRET PRIVATE ARTICLE",source_id:"PRIVATE_ORIGIN"},
  {state:"CAPACITY_DEFERRED",accepted:0,
   p0b_failure_codes:{P0B_B2_PUT_TRANSPORT_UNAVAILABLE:1,
    P0B_B2_QUOTA_HELD:2}},
  {state:"OBSERVED",accepted:1}
 ]});
 assert.equal(observed.schema,"geomacro.p0b.utc-canary-result.v1");
 assert.equal(observed.due_selected,3);
 assert.deepEqual(observed.states,{CAPACITY_DEFERRED:2,OBSERVED:1});
 assert.equal(observed.accepted,1);
 assert.deepEqual(observed.failure_code_counts,{
  P0B_B2_PUT_TRANSPORT_UNAVAILABLE:4,P0B_B2_QUOTA_HELD:2});
 assert.ok(!JSON.stringify(observed).includes("SECRET PRIVATE ARTICLE"));
 assert.ok(!JSON.stringify(observed).includes("PRIVATE_ORIGIN"));
});
test("unrecognized or hostile provider material never appears in production source failure counter",()=>{
 const observed=extract({due_selected:3,receipts:[
  {state:"CAPACITY_DEFERRED",p0b_failure_codes:{
    BAD:"raw-article-leak",P0B_OK:1,P0B_B2_PUT_HTTP_403:2}},
  {state:"CAPACITY_DEFERRED",p0b_failure_codes:{P0B_B2_PUT_HTTP_403:1}}
 ]});
 assert.deepEqual(observed.failure_code_counts,{P0B_B2_PUT_HTTP_403:3});
 assert.ok(!JSON.stringify(observed).includes("raw-article-leak"));
});
test("empty canary results do not fabricate stored originals or B2 successes",()=>{
 const empty=extract({due_selected:0,receipts:[]});
 assert.deepEqual(empty.states,{});
 assert.deepEqual(empty.failure_code_counts,{});
 assert.equal(empty.accepted,0);
 assert.doesNotMatch(JSON.stringify(empty),/verified|stored|D1_COMMITTED/u);
});
