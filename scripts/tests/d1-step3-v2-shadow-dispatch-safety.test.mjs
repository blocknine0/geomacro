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
 assert.ok(y.includes('node scripts/ops/check-d1-paid-monthly-headroom.mjs --check'));
 assert.ok(!y.includes('node scripts/ops/check-d1-headroom.mjs --check'));
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

test("manual eligibility check always logs a specific failure instead of an unexplained skipped job",()=>{
 assert.match(y,/eligibility-preflight:\s*\n/u);
 assert.match(y,/needs: eligibility-preflight/u);
 assert.match(y,/needs\.eligibility-preflight\.result == 'success'/u);
 assert.match(y,/SHADOW_APPROVAL_INPUT: \$\{\{ inputs\.approval \}\}/u);
 assert.match(y,/SHADOW_ARMED_REPOSITORY_VARIABLE: \$\{\{ vars\.GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED \}\}/u);
 assert.match(y,/Shadow approval mismatch/u);
 assert.match(y,/Shadow repository approval missing/u);
 assert.match(y,/GEOMACRO_STEP3_NOV9_ARMED/u);
});
test("eligibility preflight cannot touch Cloudflare or leak tokens",()=>{
 const block=y.split("  eligibility-preflight:")[1]?.split("  shadow-rehearsal:")[0];
 assert.ok(block);
 assert.doesNotMatch(block,/CLOUDFLARE_API_TOKEN|SIGNING_JWK|CONTROL_PLANE_TOKEN|PHASE2H_R2_REFERENCE_HMAC_KEY/u);
 assert.doesNotMatch(block,/wrangler|curl|migration|time-travel|\/api\//u);
 assert.doesNotMatch(block,/echo ["']?\$SHADOW_ARMED_REPOSITORY_VARIABLE|echo ["']?\$SHADOW_APPROVAL_INPUT/u);
 assert.match(block,/exit 3/u);
 assert.match(block,/exit 4/u);
});

test("all manual ref mistakes produce a read-only explanatory failure",()=>{
 assert.match(y,/SHADOW_DISPATCH_REF: \$\{\{ github\.ref \}\}/u);
 assert.match(y,/SHADOW_DISPATCH_REPOSITORY: \$\{\{ github\.repository \}\}/u);
 assert.match(y,/Shadow dispatch branch or repository invalid/u);
 assert.match(y,/exit 2/u);
 assert.match(y,/if: github\.event_name == 'workflow_dispatch'/u);
});
