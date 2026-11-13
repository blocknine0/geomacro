import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../../.github/workflows/apply-predge-mutual-trial-migration-0132.yml",import.meta.url),"utf8");
const deploy=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");
const promotion=readFileSync(new URL("../canary-promoter.ts",import.meta.url),"utf8");
const parity=readFileSync(new URL("../lib/canary-additive-binding-parity.mjs",import.meta.url),"utf8");

test("0132 production migration is exact-SHA, separately approved, identity and headroom gated",()=>{
 for(const value of ["mode:","[preflight, apply]","expected_main_sha:","approval:","APPROVE_PREDGE_MUTUAL_TRIAL_0132_PRODUCTION","github.ref == 'refs/heads/main'","EXPECTED_MAIN_SHA","D1_DATABASE_ID: db057ca9-9f6e-4957-ac28-144f3b798f9b","assertD1DatabaseIdentity","checkD1PaidMonthlyHeadroom","lane:'migration'"])
  assert.ok(workflow.includes(value),`missing workflow contract: ${value}`);
 assert.ok(workflow.includes('test "$EXPECTED_MAIN_SHA" = "$(git rev-parse HEAD)"'));
});

test("0132 applies only its SQL, records history, verifies schema objects and signs the receipt",()=>{
 assert.match(workflow,/--file workers\/control-plane\/migrations\/0132_predge_mutual_72h_trial\.sql/u);
 assert.match(workflow,/INSERT INTO d1_migrations/u);
 assert.match(workflow,/MUTUAL_72H_TRIAL/u);
 assert.match(workflow,/TRIAL_DELIVERED/u);
 assert.match(workflow,/predge_paid_risk_gate_monthly_usage_report/u);
 assert.match(workflow,/PREDGE_PAID_VERDICT_IDENTITY_IMMUTABLE/u);
 assert.match(workflow,/PREDGE_REFUND_STATUS_TERMINAL/u);
 assert.match(workflow,/createPrivateKey/u);
 assert.match(workflow,/key\.asymmetricKeyType!=='ed25519'/u);
 assert.match(workflow,/actions\/upload-artifact/u);
 assert.doesNotMatch(workflow,/migrations apply|--file workers\/control-plane\/migrations\/0131/u);
});

test("held rollout review carries Predge vars and allows only exact additive paid token",()=>{
 for(const name of ["PREDGE_PAID_RISK_GATE_TOKEN","PREDGE_PAID_TRAFFIC_ENABLED","PREDGE_PAID_GO_LIVE_CROSSCHECK","PREDGE_MUTUAL_TRIAL_STARTED_AT"])
  assert.ok(deploy.includes(name),`missing held rollout binding: ${name}`);
 assert.match(deploy,/PREDGE_PAID_TRAFFIC_ENABLED: \$\{\{ vars\.PREDGE_PAID_TRAFFIC_ENABLED \|\| 'NO' \}\}/u);
 assert.match(deploy,/PREDGE_PAID_GO_LIVE_CROSSCHECK: \$\{\{ vars\.PREDGE_PAID_GO_LIVE_CROSSCHECK \|\| '' \}\}/u);
 assert.match(deploy,/PREDGE_MUTUAL_TRIAL_STARTED_AT: \$\{\{ vars\.PREDGE_MUTUAL_TRIAL_STARTED_AT \|\| '' \}\}/u);
 assert.match(parity,/PREDGE_PAID_RISK_GATE_TOKEN/u);
 assert.ok(parity.includes('PREDGE_PAID_TRAFFIC_ENABLED:"NO"'));
 assert.match(parity,/PREDGE_TRIAL_RUNTIME_VAR_INVALID/u);
 assert.match(promotion,/review\.reviewed_predge_runtime_vars/u);
});
