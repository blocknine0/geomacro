import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(
 ".github/workflows/production-rollout-orchestrator.yml","utf8");
const headroom=readFileSync(
 "scripts/ops/check-d1-paid-monthly-headroom.mjs","utf8");
const getJob=name=>{
 const heading="  "+name+":\n";
 const begin=workflow.indexOf(heading);
 assert(begin>=0,"missing workflow job "+name);
 const end=workflow.slice(begin+heading.length).search(/^  [a-z0-9-]+:\n/gmu);
 return end<0?workflow.slice(begin):
  workflow.slice(begin,begin+heading.length+end);
};
test("Shadow and production Stage2 use dedicated Billing Read credential",()=>{
 for(const name of ["shadow-physical","stage2-production"]){
  const job=getJob(name);
  assert.match(job,/CLOUDFLARE_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u);
  assert.match(job,/CLOUDFLARE_BILLING_READ_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/u);
  assert.match(job,/environment: production/u);
 }
});
test("Billing Read not exposed to local tests or hot50 API job",()=>{
 assert.doesNotMatch(getJob("local-workerd"),/CLOUDFLARE_BILLING_READ_TOKEN/u);
 assert.doesNotMatch(getJob("hot50-readback"),/CLOUDFLARE_BILLING_READ_TOKEN/u);
 assert.equal((workflow.match(/CLOUDFLARE_BILLING_READ_TOKEN:/gu)??[]).length,2);
});
test("Shadow failure preserves read-only headroom diagnostic artifact",()=>{
 const shadow=getJob("shadow-physical");
 assert.match(shadow,/node scripts\/ops\/check-d1-paid-monthly-headroom\.mjs --check/u);
 assert.match(shadow,/artifacts\/release\/d1-paid-monthly-headroom\.json/u);
 assert.match(shadow,/if: always\(\)/u);
 assert.match(shadow,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(shadow,/test "\$D1_DATABASE_ID" != "\$GEOMACRO_D1_SHADOW_DATABASE_ID"/u);
});
test("Production migration remains only opt-in after successful Shadow",()=>{
 const production=getJob("stage2-production");
 assert.match(production,/needs\.shadow-physical\.result == 'success'/u);
 assert.match(production,/inputs\.execute_stage2 == true/u);
 assert.match(production,/node scripts\/ops\/run-step3-protected-d1-migrations\.mjs --apply/u);
 assert.match(production,/artifacts\/release\/d1-paid-monthly-headroom\.json/u);
 assert.match(getJob("shadow-physical"),
  /node scripts\/ops\/run-step3-protected-d1-migrations\.mjs --rehearse-shadow/u);
 assert.doesNotMatch(getJob("shadow-physical"),/--apply/u);
});
test("Headroom HOLD still exits nonzero; only enum diagnostic fields are printed",()=>{
 assert.match(headroom,/r\.status!=="PASS"/u);
 assert.match(headroom,/process\.exitCode=3/u);
 assert.match(headroom,/provider_error:category\(r\?\.provider_error\)/u);
 assert.match(headroom,/reason:category\(r\?\.reason\)/u);
 assert.doesNotMatch(headroom,/continue-on-error|console\.log\(JSON\.stringify\(process\.env\)/u);
});

test("Shadow authorization is evaluated inside the protected environment before provider access",()=>{
 const shadow=getJob("shadow-physical");
 const condition=shadow.slice(shadow.indexOf("    if: >-"),shadow.indexOf("    runs-on:"));
 assert.match(condition,/github\.event_name == 'workflow_dispatch'/u);
 assert.match(condition,/github\.repository == 'blocknine0\/geomacro'/u);
 assert.match(condition,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(condition,/inputs\.approval == 'REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL'/u);
 assert.doesNotMatch(condition,/vars\.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED/u);
 assert.match(shadow,/SHADOW_APPROVAL_VALUE: \$\{\{ vars\.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED \}\}/u);
 assert.doesNotMatch(shadow,/^\s+GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED: "YES"/mu);
 assert.doesNotMatch(shadow,/^\s+GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED: \$\{\{/mu);
 const steps=shadow.slice(shadow.indexOf("    steps:"));
 const approval=steps.indexOf("Require protected Shadow rehearsal approval after environment admission");
 const checkout=steps.indexOf("actions/checkout@");
 const provider=steps.indexOf("node scripts/ops/check-d1-paid-monthly-headroom.mjs --check");
 const physical=steps.indexOf("node scripts/ops/run-step3-protected-d1-migrations.mjs --rehearse-shadow");
 assert(approval>0&&approval<checkout&&checkout<provider&&provider<physical);
 assert.match(steps,/\$\{SHADOW_APPROVAL_VALUE:-\}" != "YES"/u);
 assert.match(steps,/printf '%s\\n' 'GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED=YES' >> "\$GITHUB_ENV"/u);
 assert.match(steps,/exit 3/u);
 assert.doesNotMatch(steps,/continue-on-error: true/u);
 const production=getJob("stage2-production");
 assert.match(production,/needs\.shadow-physical\.result == 'success'/u);
 assert.match(production,/inputs\.execute_stage2 == true/u);
});
