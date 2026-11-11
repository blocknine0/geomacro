import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("Step3 Hot50 acceptance requires same-run physical B2/D1 parity before five gates",()=>{
 const yaml=readFileSync(".github/workflows/production-rollout-orchestrator.yml","utf8");
 const section=yaml.split("\n  hot50-readback:\n")[1];
 assert.ok(section,"hot50-readback must exist");
 assert.match(section,/needs:\s*stage2-production/u);
 assert.match(section,/needs\.stage2-production\.result == 'success'/u);
 assert.match(section,/B2_ACCOUNT_QUOTA_REQUIRED: "1"/u);
 assert.match(section,/D1_DATABASE_ID: \\\$\\\{\\\{ vars\\\.D1_DATABASE_ID \\\|\\\| secrets\\\.D1_DATABASE_ID \\\}\\\}/u);
 assert.match(section,/Verify exact main and canonical D1 quota ledger identity before B2/u);
 assert.match(section,/HOT50_EXACT_MAIN_CHANGED/u);
 assert.match(section,/HOT50_D1_CANONICAL_BINDING_MISMATCH/u);
 assert.ok(section.indexOf("HOT50_D1_CANONICAL_BINDING_MISMATCH")<
   section.indexOf("audit-hot50-b2-d1-parity.mjs"));

 assert.match(section,/B2_REQUEST_BUDGET: "250"/u);
 assert.match(section,/PARITY_MAX_B2_READS: "240"/u);
 assert.match(section,/B2_PARITY_VERIFIED_RECEIPT_JSON: \/tmp\/hot50-proof\/parity\.json/u);
 assert.match(section,/GEOMACRO_CONTROL_PLANE_URL: https:\/\/geomacro-control-plane\.daspallab202391\.workers\.dev/u);
 assert.match(section,/ACTIVATION_RUN_IDEMPOTENT_REDRIVE: "0"/u);
 assert.match(section,/ROOT_LEDGER_TOKEN: \$\{\{ secrets\.GEOMACRO_COMMERCE_LEDGER_TOKEN \}\}/u);
 assert.match(section,/B2_SPOOL_ENCRYPTION_KEY","geomacro-p0b-private-spool-aes-gcm-v1/u);
 assert.match(section,/appendFileSync\(process\.env\.GITHUB_ENV,name\+"="\+value\+"\\n"\)/u);
 assert.match(section,/node scripts\/ops\/audit-hot50-b2-d1-parity\.mjs > \/tmp\/hot50-proof\/parity\.json 2> \/tmp\/hot50-proof\/parity-error\.json/u);
 assert.ok(section.indexOf("audit-hot50-b2-d1-parity.mjs")<section.indexOf("verify-hot50-production-activation.mjs"));
 assert.ok(section.indexOf("verify-hot50-production-activation.mjs")<section.indexOf("verify-hot50-risk-gate-tiers.mjs"));
 assert.match(section,/continue-on-error: true/u);
 assert.match(section,/\/tmp\/hot50-proof\/\*\.json/u);
 assert.doesNotMatch(section,/wrangler\s+(?:deploy|secret put)|GEOMACRO_ENABLE_PAYMENTS.*YES/u);
});

test("real physical parity producer remains fail-closed for partial audits and nonbidirectional scope",()=>{
 const producer=readFileSync("scripts/ops/audit-hot50-b2-d1-parity.mjs","utf8");
 const verifier=readFileSync("scripts/ops/hot50-parity-proof.mjs","utf8");
 assert.match(producer,/READ_BUDGET_PARTIAL/u);
 assert.match(producer,/D1_MANIFEST_CHANGED_DURING_AUDIT/u);
 assert.match(producer,/independent_s3_get_sha256_aes_gcm_restoration/u);
 assert.match(producer,/physical_bucket_list_complete:false/u);
 assert.match(producer,/bidirectional_parity_pass:false/u);
 assert.match(verifier,/b\.head_sha===head&&b\.run_id===run/u);
 assert.match(verifier,/b\.status==="PASS"/u);
 assert.match(verifier,/now-Date\.parse\(b\.checked_at\)<=600000/u);
});
