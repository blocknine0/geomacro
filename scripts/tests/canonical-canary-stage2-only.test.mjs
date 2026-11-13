import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../../.github/workflows/geomacro-protected-hot50-worker-rollout.yml",import.meta.url),"utf8");
const canonical=readFileSync(new URL("../canary-promoter.ts",import.meta.url),"utf8");
const deploy=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");
const uploader=readFileSync(new URL("../ops/prepare-optimized-worker-candidate.mjs",import.meta.url),"utf8");

test("every manual Hot50 canary requires real signed 0204/0211/0212/0213 Stage2",()=>{
  assert.match(workflow,/stage2_run_id:\s*\n\s*description:[^\n]*Stage2[^\n]*\n\s*required: true/);
  assert.match(workflow,/run\.path!=='.github\/workflows\/production-rollout-orchestrator\.yml'/);
  assert.match(workflow,/run\.head_sha!==process\.env\.EXPECTED_SHA/);
  assert.match(workflow,/run\.conclusion!=='success'/);
  assert.match(workflow,/stage2\[0\]\.conclusion!=='success'/);
  assert.match(workflow,/shadow\[0\]\.conclusion!=='success'/);
  assert.match(workflow,/name: geomacro-step3-production/);
  assert.match(workflow,/admitSignedStep3ProductionFile\(\)/);
  assert.match(workflow,/node --experimental-strip-types scripts\/apply-d1-migrations\.ts --verify/);
  assert.match(workflow,/config\/d1-hotspot-v2-canary\.hold/);
});
test("alternate 60s stage shortcut is retired in favor of canonical SLO, rollback and full observations",()=>{
  assert.match(workflow,/node --experimental-strip-types scripts\/canary-promoter\.ts --promote/);
  assert.match(workflow,/node scripts\/ops\/verify-protected-worker-promotion\.mjs/);
  assert.doesNotMatch(workflow,/sleep 60\b/);
  assert.doesNotMatch(workflow,/for percent in 0 1 5 25 50 100/);
  assert.doesNotMatch(workflow,/npx -y.*wrangler.*versions deploy/);
  assert.match(canonical,/const STAGES=\[0,1,5,25,50,100\]/);
  assert.match(canonical,/percent===1\?30\*60\*1000:15\*60\*1000/);
  assert.match(canonical,/async function deployBaseline/);
  assert.match(canonical,/CANARY_P95_BASELINE_LATENCY_REGRESSION/);
  assert.match(canonical,/CANARY_SLO_BREACH/);
  assert.match(canonical,/CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE/);
  assert.match(canonical,/await deployBaseline\(base\)/);
  assert.match(workflow,/timeout-minutes: 115/);
});


test("Hot50 promotion derives and authenticates existing production bearer before canary gates",()=>{
 const auth=workflow.indexOf("Verify existing production bearer from protected root");
 const root=workflow.indexOf("secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN",auth);
 const derived=workflow.indexOf("node scripts/ops/prepare-five-gate-control-token.mjs",root);
 const billing=workflow.indexOf("Require real provider Workers Paid month-wide 30-percent reserve",derived);
 const signed=workflow.indexOf("admitSignedStep3ProductionFile()",billing);
 const promoter=workflow.indexOf("scripts/canary-promoter.ts --promote",signed);
 assert(auth>0&&root>auth&&derived>root&&billing>derived&&signed>billing&&promoter>signed);
 assert.doesNotMatch(workflow.slice(auth,billing),/wrangler.*secret put|gh secret set|continue-on-error/u);
});

test("held deployment uses the pinned candidate uploader and canonical signed promoter",()=>{
 assert.match(deploy,/d1-v2-canary-release-hold:/);
 assert.match(deploy,/allow_deploy=false/);
 assert.match(deploy,/held-versioned-canary-rollout:/);
 assert.match(deploy,/outputs\.hold_present == 'true'/);
 assert.match(deploy,/prepare-optimized-worker-candidate\.mjs/);
 assert.match(uploader,/\['-y','wrangler@4\.136\.3','versions','upload'/);
 assert.match(uploader,/--secrets-file/);
 assert.match(deploy,/uses: actions\/download-artifact@/);
 assert.match(deploy,/admitSignedStep3ProductionFile\(\)/);
 assert.match(deploy,/scripts\/canary-promoter\.ts --promote/);
 assert.match(deploy,/allow_deploy == 'true'/);
 assert.match(deploy,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(canonical,/CANARY_DIRECTED_HEALTH_SHA_UNVERIFIED/);
 assert.match(canonical,/CANARY_DIRECTED_D1_READINESS_UNVERIFIED/);
 assert.match(canonical,/progressive_decision_ed25519_signer_configured===true/);
 assert.match(canonical,/paid_launch_approved===false/);
 assert.match(canonical,/execution_authorized===false/);
});
