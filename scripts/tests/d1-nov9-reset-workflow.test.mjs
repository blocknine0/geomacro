import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(".github/workflows/d1-nov9-utc-protected-migration-window.yml","utf8");
const manifest=JSON.parse(readFileSync("config/github-workflow-inventory.v1.json","utf8"));
const pinned="3c8fe6a51c8b34aa75d43ab0c77e5395d3fe16f2";

test("Nov9 00:05 UTC is explicitly scheduled only with exact year guard",()=>{
 assert.match(source,/- cron: "5 0 9 11 \*"/u);
 assert.match(source,/test "\$\(date -u \+%Y-%m-%d\)" = "2026-11-09"/u);
 assert.match(source,/NOV9_0005_WINDOW_MISSED/u);
 assert.match(source,/NOV9_0010_SHADOW_WINDOW_MISSED/u);
 assert.match(source,/NOV9_0020_MIGRATION_WINDOW_MISSED/u);
 assert.match(source,/2026-11-09T00:05:00Z/u);
 assert.match(source,/2026-11-09T00:10:00Z/u);
 assert.match(source,/2026-11-09T00:20:00Z/u);
});
test("schedule is unarmed by default and manual production execute requires explicit true",()=>{
 assert.match(source,/vars\.GEOMACRO_STEP3_NOV9_ARMED == 'YES'/u);
 assert.match(source,/github\.event_name == 'workflow_dispatch' && inputs\.execute == true/u);
 assert.match(source,/environment: production/u);
 assert.match(source,/permissions:\s*contents: read/u);
 assert.match(source,/cancel-in-progress: false/u);
 assert.match(source,/github\.ref == 'refs\/heads\/main'/u);
});
test("all stages are pinned to immutable exact Step3 source and D1 production/shadow DB must differ",()=>{
 assert.match(source,new RegExp(pinned,"u"));
 assert.match(source,/test "\$\(git rev-parse HEAD\)" = "\$GEOMACRO_STEP3_EXACT_SHA"/u);
 assert.match(source,/GEOMACRO_D1_SHADOW_DATABASE_ID/u);
 assert.match(source,/D1_DATABASE_ID/u);
 assert.match(source,/CLOUDFLARE_API_TOKEN/u);
 assert.match(source,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(source,/node scripts\/ops\/check-d1-headroom\.mjs --check/u);
 assert.match(source,/node scripts\/ops\/verify-d1-publisher-billable-shadow\.mjs --run-shadow/u);
 assert.match(source,/node scripts\/ops\/run-step3-protected-d1-migrations\.mjs --apply/u);
 assert.match(source,/post_migration_readback_explicit_PASS/u);
});
test("first stage requires *both* account-wide counters strictly below 10000",()=>{
 assert.match(source,/d\.observed_rows_read>=10000\|\|d\.observed_rows_written>=10000/u);
 assert.match(source,/d\.status!=='PASS'/u);
 assert.match(source,/x\.identical_retry_zero_billable_rows_written!==true/u);
 assert.match(source,/x\.batch_write_matches_single_changed_record_delta!==true/u);
});
test("no HOLD deletion, PR merging, Worker deployment, B2 or source throttling",()=>{
 assert.doesNotMatch(source,/\b(?:rm|unlink|git push|gh pr merge|wrangler deploy|wrangler triggers|curl .*\/v1\/commercial)\b/iu);
 assert.doesNotMatch(source,/migration 0214|0214_gro_backfill/u);
 assert.match(source,/if: always\(\)/u);
 assert.equal(manifest.retainedWorkflowFiles.filter(x=>
  x==="d1-nov9-utc-protected-migration-window.yml").length,1);
});
