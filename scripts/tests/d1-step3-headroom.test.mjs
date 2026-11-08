import {test} from "node:test";
import assert from "node:assert/strict";
import {assessD1MigrationHeadroom,checkD1Headroom,
 HEADROOM_HOLD_CODE} from "../ops/check-d1-headroom.mjs";
import {assessD1AccountFreeQuota} from "../ops/audit-d1-account-daily-quota-readonly.mjs";
import {assessOneChangedBatchDelta}
 from "../ops/verify-d1-publisher-billable-shadow.mjs";

const DAY=new Date("2026-11-08T09:00:00.000Z");
function provider(rowsRead,rowsWritten,day="2026-11-08",dbCount=2){
 return {schema:"geomacro.d1-account-daily-quota-readonly.v1",
  day_utc:day,provider_graphql_usage_observed:true,
  account_database_count_observed:dbCount,
  observed_rows_read:rowsRead,observed_rows_written:rowsWritten};
}
test("strict 60k UTC gate holds if EITHER dimension reaches 60000",()=>{
 for(const [reads,writes,ok] of [
  [0,0,true],[59999,59999,true],[59999,60000,false],
  [60000,59999,false],[60000,60000,false],[65000,10,false],
  [10,130000,false]
 ]){
  const x=assessD1MigrationHeadroom(provider(reads,writes),{now:DAY});
  assert.equal(x.status,ok?"PASS":"HOLD");
  assert.equal(x.read_80k_reserved,140000-reads>=80000);
  assert.equal(x.write_80k_reserved,140000-writes>=80000);
  if(!ok)assert.equal(x.code,HEADROOM_HOLD_CODE);
  else{
   assert(x.remaining_rows_read>80000);
   assert(x.remaining_rows_written>80000);
   assert.equal(x.authorization_scope,"MIGRATIONS_ONLY_NOT_DEPLOYMENT_OR_PAYMENTS");
  }
 }
});
test("stale UTC day, empty or unverified account metrics always HOLD",()=>{
 for(const x of [
  provider(5,5,"2026-11-07"),
  {...provider(5,5),provider_graphql_usage_observed:false},
  {...provider(5,5),account_database_count_observed:0},
  {...provider(5,5),observed_rows_read:null},
  {...provider(5,5),observed_rows_written:-1},
  {status:"CAUTIOUS_D1_HEADROOM"}
 ]){
  const v=assessD1MigrationHeadroom(x,{now:DAY});
  assert.equal(v.status,"HOLD");
  assert.equal(v.code,HEADROOM_HOLD_CODE);
  assert.equal(v.hold_file_untouched,true);
  assert.equal(v.pr_merge_authorized,false);
 }
});
test("GraphQL aggregates all D1 databases, never production-only",()=>{
 const input={data:{viewer:{accounts:[{
  d1AnalyticsAdaptiveGroups:[
   {dimensions:{databaseId:"production-abcd",date:"2026-11-08"},
    sum:{rowsRead:30000,rowsWritten:8000}},
   {dimensions:{databaseId:"shadow-db-xyz",date:"2026-11-08"},
    sum:{rowsRead:29999,rowsWritten:51999}}
  ]
 }]}}};
 const raw=assessD1AccountFreeQuota(input,{day:"2026-11-08"});
 assert.equal(raw.observed_rows_read,59999);
 assert.equal(raw.observed_rows_written,59999);
 assert.equal(assessD1MigrationHeadroom(raw,{now:DAY}).status,"PASS");
 input.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups[1].sum.rowsWritten++;
 const updated=assessD1AccountFreeQuota(input,{day:"2026-11-08"});
 assert.equal(assessD1MigrationHeadroom(updated,{now:DAY}).status,"HOLD");
});
test("provider refusal emits HOLD report, never phantom zero usage",async()=>{
 let saved=null;
 const r=await checkD1Headroom({
  now:new Date(),
  readProvider:async()=>{throw Error("D1_ACCOUNT_QUOTA_AUTH_MISSING")},
  reportPath:"artifacts/release/test-step3-headroom.json",
  write:(_p,body)=>{saved=JSON.parse(body)}
 });
 assert.equal(r.status,"HOLD");
 assert.equal(r.code,HEADROOM_HOLD_CODE);
 assert.equal(r.observed_rows_read,null);
 assert.equal(saved.provider_error,"D1_ACCOUNT_QUOTA_AUTH_MISSING");
 assert.equal(saved.account_wide_reservation_atomic,false);
 assert.equal(saved.hold_file_untouched,true);
});
test("50-item changed row must match measured single-row control INCLUDING index/trigger writes",()=>{
 const run=(first,retry,one,control,individual=100)=>
  assessOneChangedBatchDelta({
   firstWrite:{rows_read:150,rows_written:first,changes:100},
   retry:{rows_read:120,rows_written:retry,changes:0},
   oneChanged:{rows_read:130,rows_written:one,changes:2},
   singleControl:{rows_read:1,rows_written:control,changes:2},
   singleItemTotal:individual
  });
 assert.equal(run(150,0,3,3).accepted,true);
 assert.equal(run(150,0,1,3).accepted,false);
 assert.equal(run(150,1,3,3).accepted,false);
 assert.equal(run(3,0,3,3).accepted,false);
 assert.equal(run(150,0,3,0).accepted,false);
 const good=run(150,0,3,3);
 assert.equal(good.batch_write_matches_single_changed_record_delta,true);
 assert.equal(good.single_changed_record_billable_rows,3);
 assert.equal(good.provider_index_and_trigger_rows_are_billable,true);
});
