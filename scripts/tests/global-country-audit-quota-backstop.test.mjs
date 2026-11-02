import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL(
 "../../.github/workflows/global-country-readiness-audit.yml",import.meta.url),"utf8");
const publisher=readFileSync(new URL(
 "../ops/archive-195x3-global-readiness-proof.mjs",import.meta.url),"utf8");
test("two bounded UTC daily observations retry after quota reset without unsigned proof",()=>{
 assert.match(workflow,/cron: "37 0 \* \* \*"/u);
 assert.match(workflow,/cron: "27 6 \* \* \*"/u);
 assert.match(workflow,/group: geomacro-global-country-readiness-audit/u);
 assert.match(workflow,/B2_ACCOUNT_QUOTA_REQUIRED: "1"/u);
 assert.match(workflow,/B2_ACCOUNT_QUOTA_WORKFLOW_ID: global_195_audit/u);
 assert.match(workflow,/B2_REQUEST_BUDGET: "12"/u);
 assert.match(workflow,/archive-195x3-global-readiness-proof\.mjs/u);
 assert.match(publisher,/SHARED_B2_QUOTA_BUFFER_REQUIRED/u);
 assert.match(publisher,/createB2D1AccountGovernor/u);
 assert.match(publisher,/verifyPreviousSnapshot/u);
 assert.match(publisher,/putWithMetadataVerification/u);
 assert.doesNotMatch(workflow,/B2_ACCOUNT_QUOTA_REQUIRED: "0"/u);
 assert.doesNotMatch(workflow,/continue-on-error: true/u);
});
