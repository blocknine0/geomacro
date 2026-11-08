import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(".github/workflows/d1-paid-monthly-provider-proof-readonly.yml","utf8");
const inv=JSON.parse(readFileSync("config/github-workflow-inventory.v1.json","utf8"));
test("manual owner-approved only; cannot run on cron or main push",()=>{
 assert.match(source,/workflow_dispatch:/u);
 assert.doesNotMatch(source,/\bschedule:\s*\n\s*- cron:/u);
 assert.match(source,/CHECK_PAID_D1_MONTHLY_QUOTA_READ_ONLY/u);
 assert.match(source,/github\.event_name == 'workflow_dispatch'/u);
 assert.match(source,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(source,/environment: production/u);
});
test("exact immutable reviewed monthly code, no branch tip guessing",()=>{
 const sha="42ddf05c4466d69bd02ff92a01ddeb67c7d3d543";
 assert.match(source,new RegExp(sha,"u"));
 assert.ok(source.includes('test "$(git rev-parse HEAD)" = "$GEOMACRO_D1_PAID_READONLY_SHA"'));
 assert.match(source,/check-d1-paid-monthly-headroom\.mjs --check/u);
 assert.match(source,/d1-workers-paid-monthly-governor\.test\.mjs/u);
});
test("only read-only provider billing and telemetry, never D1 SQL or payments",()=>{
 assert.doesNotMatch(source,/run-step3-protected-d1-migrations\.mjs|d1 migrations apply|wrangler deploy|gh pr merge|enable-payments|rm -f/u);
 assert.match(source,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(source,/permissions:\s*contents: read/u);
 assert.match(source,/if: always\(\)/u);
 assert.match(source,/d1-paid-monthly-headroom\.json/u);
});
test("workflow inventory pin prevents duplicate accidental scheduled source",()=>{
 assert.equal(inv.retainedWorkflowFiles.filter(x=>
  x==="d1-paid-monthly-provider-proof-readonly.yml").length,1);
});
