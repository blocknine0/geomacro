import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const recovery=readFileSync(new URL("../../.github/workflows/recover-d1-quota-deployment-after-reset.yml",import.meta.url),"utf8");
const deploy=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");

test("quota reset recovery sends the exact protected deployment confirmation",()=>{
  assert.match(deploy,/DEPLOY_D1_CONTROL_PLANE_MAIN_NO_FUNDS/);
  assert.match(recovery,/"inputs":\{"confirmation":"DEPLOY_D1_CONTROL_PLANE_MAIN_NO_FUNDS"\}/);
  assert.match(recovery,/actions\/workflows\/deploy-d1-control-plane\.yml\/dispatches/);
  assert.match(recovery,/cron: "10 0 \* \* \*"/);
});

test("GitHub job log is plain text, never assumed to be workflow-run ZIP",()=>{
  assert.match(recovery,/actions\/jobs\/\$job_id\/logs/);
  assert.doesNotMatch(recovery,/^\s*unzip -p /mu);
  assert.match(recovery,/D1_QUOTA_RECOVERY_JOB_LOG_NOT_VERIFIABLE/);
  assert.match(recovery,/log_bytes > 2000000/);
  assert.match(recovery,/grep -aFq/);
});

test("recover only an exact-main confirmed quota 7500 migration/schema failure",()=>{
  assert.match(recovery,/\$failed_sha" != "\$GITHUB_SHA"/);
  assert.match(recovery,/Apply committed D1 migrations remotely/);
  assert.match(recovery,/migration_conclusion" != "failure"/);
  assert.match(recovery,/schema_conclusion" != "failure"/);
  assert.match(recovery,/Your account has exceeded D1's free tier daily row read limit/);
  assert.match(recovery,/code: 7500/);
  assert.match(recovery,/retry=false/);
  assert.match(recovery,/steps\.diagnose\.outputs\.retry == 'true'/);
});
test('held green publishers get one post-reset wakeup without bypassing their quota or cadence guard',()=>{
 assert.match(recovery,/Wake the existing quota-guarded source publisher after UTC reset/);
 assert.match(recovery,/actions\/workflows\/five-minute-original-news-fastlane\.yml\/dispatches/);
 assert.match(recovery,/SOURCE_RESET_WAKEUP_DISPATCHED; publication\/readback not yet asserted/);
 assert.equal((recovery.match(/cron:/g)||[]).length,1);
});

test("recovery is no-funds, with no manual grant bypass or partner mutation",()=>{
  assert.doesNotMatch(recovery,/wrangler\s+(?:deploy|d1 execute|secret put)/);
  assert.doesNotMatch(recovery,/predge.*secret put/iu);
  assert.doesNotMatch(recovery,/\b(?:USDC|payment|settlement)\b.*(?:send|transfer|charge)/iu);
  assert.match(deploy,/test "\$DEPLOY_CONFIRMATION" = "DEPLOY_D1_CONTROL_PLANE_MAIN_NO_FUNDS"/);
});

test("post-reset main deployment may advance after old failed SHA, but only verified GitHub ancestry can retry",()=>{
 assert.match(recovery,/if \[\[ "\$failed_sha" != "\$GITHUB_SHA" \]\]; then/);
 assert.match(recovery,/\^\[a-f0-9\]\{40\}\$/);
 assert.match(recovery,/\$api\/compare\/\$failed_sha\.\.\.\$GITHUB_SHA/);
 assert.match(recovery,/\.status == "ahead"/);
 assert.match(recovery,/\.behind_by == 0/);
 assert.match(recovery,/\.base_commit\.sha == \$failed/);
 assert.match(recovery,/\.merge_base_commit\.sha == \$failed/);
 assert.match(recovery,/D1_QUOTA_RECOVERY_ANCESTRY_UNAVAILABLE/);
 assert.match(recovery,/D1_QUOTA_RECOVERY_DIVERGENT_MAIN_HOLD/);
 assert.match(recovery,/D1_QUOTA_RECOVERY_FAILED_COMMIT_IS_MAIN_ANCESTOR/);
 assert.doesNotMatch(recovery,/\.commits\[-1\]\.sha/);
 // Exact-GitHub-main verification must occur *before* inspecting any
 // protected D1 failure evidence or dispatching the deploy.
 assert.ok(recovery.indexOf("compare/$failed_sha...$GITHUB_SHA")<
   recovery.indexOf('jobs_file="$RUNNER_TEMP/deploy-jobs.json"'));
 assert.ok(recovery.indexOf("code: 7500")<
   recovery.indexOf("Dispatch canonical Worker deployment after quota reset"));
});
test("free/no-new-spend deployment recovery requires no R2 checkout, Workers Paid plan or private PREDGE alteration",()=>{
 assert.doesNotMatch(recovery,/CLOUDFLARE_BILLING_READ_TOKEN|GEOMACRO_PRIVATE_OSINT_R2_ACCESS_KEY_ID/);
 assert.doesNotMatch(recovery,/R2\\s+create|workers_paid|subscribe|chargeCard/iu);
 assert.match(recovery,/Wake the existing quota-guarded source publisher after UTC reset/);
 assert.match(recovery,/actions\/workflows\/five-minute-original-news-fastlane\.yml\/dispatches/);
});
