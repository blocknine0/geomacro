import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const y=readFileSync(".github/workflows/d1-step3-v2-shadow-only-rehearsal.yml","utf8");
test("exact immutable audited Step3 V2 SHA only, never run a user-controlled commit",()=>{
 assert.match(y,/a9cb982b346e86ed99401e0ae99a1f006c02bae6/u);
 assert.doesNotMatch(y,/ref:\s*\$\{\{ inputs\./u);
 assert.match(y,/test "\$\(git rev-parse HEAD\)" = "\$GEOMACRO_STEP3_EXACT_SHA"/u);
});
test("no automatic trigger; manual only with exact owner approval",()=>{
 assert.match(y,/workflow_dispatch:/u);
 assert.doesNotMatch(y,/\bschedule:\s*\n\s+- cron:/u);
 assert.match(y,/REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL/u);
 assert.match(y,/vars\.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED == 'YES'/u);
 assert.match(y,/environment: production/u);
});
test("runner never executes production D1 --apply; UUIDs must differ",()=>{
 assert.match(y,/--rehearse-shadow/u);
 assert.doesNotMatch(y,/run-step3-protected-d1-migrations\.mjs --apply/u);
 assert.match(y,/test "\$D1_DATABASE_ID" != "\$GEOMACRO_D1_SHADOW_DATABASE_ID"/u);
 assert.match(y,/node scripts\\/ops\\/check-d1-paid-monthly-headroom\\.mjs --check/u);
 assert.doesNotMatch(y,/d1-headroom\\.mjs --check/u);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/u);
});
test("shadow host is an independent binding, R2 key is secret, and receipt is retained on failure",()=>{
 assert.match(y,/GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST/u);
 assert.match(y,/secrets\.GEOMACRO_D1_RECOVERY_AES256_KEY_B64/u);
 assert.match(y,/secrets\.PHASE2H_R2_REFERENCE_HMAC_KEY/u);
 assert.match(y,/secrets\.CONTROL_PLANE_TOKEN/u);
 assert.match(y,/if: always\(\)/u);
 assert.match(y,/step3-shadow-rehearsal-receipt\.json/u);
});
