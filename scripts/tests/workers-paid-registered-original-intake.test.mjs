import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planD1BundledWork} from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY} from "../ops/audit-d1-account-daily-quota-readonly.mjs";
import {WORKERS_PAID_PROOF_SCHEMA} from "../lib/cloudflare-workers-paid-plan-proof.mjs";
const now=new Date("2026-11-10T18:08:12.000Z");
const quota=(rowsRead,rowsWritten)=>({
 schema:"geomacro.d1-account-daily-quota-readonly.v1",
 day_utc:"2026-11-10",provider_graphql_usage_observed:true,
 observed_rows_read:rowsRead,observed_rows_written:rowsWritten,
 limits:{...D1_FREE_DAILY},
 remaining_rows_read:Math.max(0,D1_FREE_DAILY.rows_read-rowsRead),
 remaining_rows_written:Math.max(0,D1_FREE_DAILY.rows_written-rowsWritten)
});
const paidProof={
 schema:WORKERS_PAID_PROOF_SCHEMA,verified:true,
 source:"CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ",
 observed_at:now.toISOString(),subscription_changed:false,
 billing_action_performed:false
};
test("real Paid original intake incident no longer starves observed source originals at zero Free cap",()=>{
 const x=planD1BundledWork(quota(15_846_041,392_683),{now,paidProof});
 assert.equal(x.state,"CRITICAL_ONLY");
 assert.equal(x.source_intake,true);
 assert.equal(x.phase2h_raw_archive,true);
 assert.equal(x.registered_private_max_new_rows,0);
 assert.equal(x.paid_registered_original_source_lane,true);
 assert(Number.isSafeInteger(x.paid_registered_original_max_rows));
 assert(x.paid_registered_original_max_rows>=3&&
  x.paid_registered_original_max_rows<=20);
 assert(x.paid_registered_original_max_rows<=x.source_intake_max_new_rows);
 assert.equal(x.research,false);
 assert.equal(x.maintenance,false);
 assert.equal(x.paid_calls,0);
});
test("unknown stale paid or insufficient quota cannot grant the new monthly source lane",()=>{
 const good=quota(15_846_041,392_683);
 const cases=[
  [good,{now}],
  [good,{now,paidProof:{...paidProof,verified:false}}],
  [good,{now,paidProof:{...paidProof,observed_at:"2026-11-09T00:00:00Z"}}],
  [quota(15_846_041,1_099_800),{now,paidProof}],
  [{...good,day_utc:"2026-11-09"},{now,paidProof}]
 ];
 for(const [s,opts] of cases){
  const x=planD1BundledWork(s,opts);
  assert.notEqual(x.paid_registered_original_source_lane,true);
  assert.equal(x.paid_registered_original_max_rows??0,0);
 }
});
test("original publisher Paid admission requires independent hot50_source monthly PASS and real B2 account quota",()=>{
 const wf=readFileSync(".github/workflows/all-source-reusable-news-json.yml","utf8");
 const prov=readFileSync("scripts/ops/check-d1-paid-monthly-headroom.mjs","utf8");
 const ingest=readFileSync("scripts/ops/publish-all-source-reusable-news-json.ts","utf8");
 const manager=readFileSync("scripts/ops/phase2h-b2-first-private-raw.mjs","utf8");
 const required=[
  "id: paid-monthly-originals",
  "paid_registered_original_source_lane == 'true'",
  "paid_registered_original_max_rows != '0'",
  "node scripts/ops/check-d1-paid-monthly-headroom.mjs --hot50-source",
  'echo "admitted=false" >> "$GITHUB_OUTPUT"',
  "steps.paid-monthly-originals.outputs.admitted == 'true'",
  "PHASE2H_PROVIDER_MAINTENANCE:",
  "B2_ACCOUNT_QUOTA_REQUIRED: \"1\"",
  "B2_ACCOUNT_QUOTA_WORKFLOW_ID: registered_original_archive",
  "GEOMACRO_REGISTERED_PRIVATE_MAX_NEW_ROWS:",
  "stageB2FirstPrivateOriginals"
 ];
 for(const phrase of required)
  assert(wf.includes(phrase)||ingest.includes(phrase),phrase);
 assert.match(prov,/lane=argv\[0\]==="--hot50-source"\?"hot50_source":"migration"/u);
 assert.match(prov,/runD1PaidMonthlyHeadroom\(\{lane\}\)/u);
 assert.match(manager,/createB2D1AccountGovernor/u);
 assert.match(manager,/putWithMetadataVerification/u);
 assert.match(manager,/b2\.get\(plan\.key\)/u);
 assert.doesNotMatch(wf,/GEOMACRO_STEP3_RECOVERY_V2_APPROVED: YES/u);
});
test("legacy Free and Paid source admissions remain separate and source-only",()=>{
 const planner=readFileSync("scripts/ops/plan-d1-bundled-work.mjs","utf8");
 const wf=readFileSync(".github/workflows/all-source-reusable-news-json.yml","utf8");
 assert.match(planner,/registered_private_max_new_rows:0/u);
 assert.match(planner,/paid_registered_original_max_rows:/u);
 assert.match(planner,/source_intake_max_new_rows:/u);
 assert.match(wf,/steps.quota.outputs.registered_private_max_new_rows != '0'/u);
 assert.match(wf,/steps.paid-monthly-originals.outputs.admitted == 'true'/u);
 assert.match(wf,/steps.quota.outputs.paid_registered_original_max_rows/u);
 assert.equal((wf.match(/id: paid-monthly-originals/g)??[]).length,1);
 assert.equal((wf.match(/--hot50-source/g)??[]).length,1);
});
