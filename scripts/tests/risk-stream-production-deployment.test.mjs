import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");
const candidateWorkflow=readFileSync(new URL("../../.github/workflows/geomacro-optimized-worker-candidate.yml",import.meta.url),"utf8");
const example=readFileSync(new URL("../../workers/control-plane/wrangler.example.jsonc",import.meta.url),"utf8");
const issuer=readFileSync(new URL("../../workers/control-plane/src/risk-stream-commercial-issuer.mjs",import.meta.url),"utf8");

test("stream activation is read from protected production vars in both deployment paths",()=>{
 for(const name of ["RISK_STREAM_ACTIVE","STREAM_INGESTION_ENABLED","STREAM_MODE",
  "RISK_STREAM_HOT50_AUTONOMOUS_ENABLED","GEOMACRO_COMMERCIAL_STREAM_RELEASE",
  "RISK_STREAM_CANARY_HOLD_CLEARED","RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED"]){
  assert.match(workflow,new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\|\\|`));
  assert.match(workflow,new RegExp(`process\\.env\\.${name}`));
 }
 assert.match(workflow,/RISK_STREAM_ACTIVE: \$\{\{ vars\.RISK_STREAM_ACTIVE \|\| '0' \}\}/);
 assert.match(workflow,/STREAM_INGESTION_ENABLED: \$\{\{ vars\.STREAM_INGESTION_ENABLED \|\| 'false' \}\}/);
 assert.match(workflow,/STREAM_MODE: \$\{\{ vars\.STREAM_MODE \|\| 'DISABLED' \}\}/);
 assert.match(candidateWorkflow,/STREAM_MODE: \$\{\{ vars\.STREAM_MODE \|\| 'DISABLED' \}\}/);
 assert.match(workflow,/Object\.assign\(config\.vars, streamVars\)/);
 assert.match(workflow,/STREAM_MODE_CANDIDATE_CONFIG_BINDING_MISSING/);
 assert.match(example,/"RISK_STREAM_ACTIVE": "0"/);
 assert.match(example,/"STREAM_INGESTION_ENABLED": "false"/);
 assert.match(example,/"STREAM_MODE": "DISABLED"/);
 assert.match(example,/"GEOMACRO_COMMERCIAL_STREAM_RELEASE": "0"/);
 assert.match(example,/"RISK_STREAM_CANARY_HOLD_CLEARED": "0"/);
 assert.match(example,/"RISK_STREAM_HOT50_AUTONOMOUS_ENABLED": "0"/);
 assert.match(example,/"RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED": "0"/);
});

test("production deployment validates signer keypair, distinct attestations and archive key",()=>{
 for(const name of ["RISK_STREAM_GRO_SIGN_PKCS8_B64","RISK_STREAM_GRO_VERIFY_SPKI_B64",
  "RISK_STREAM_MACHINE_FACTS_SPKI_B64","RISK_STREAM_MACHINE_RIGHTS_SPKI_B64",
  "RISK_STREAM_AES256_KEY_B64"])
  assert.match(workflow,new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
 assert.match(workflow,/RISK_STREAM_GRO_SIGNING_KEYPAIR_MISMATCH/);
 assert.match(workflow,/RISK_STREAM_DUAL_ATTESTERS_MUST_BE_DISTINCT/);
 assert.match(workflow,/RISK_STREAM_ARCHIVE_AES256_KEY_INVALID/);
 assert.match(workflow,/RISK_STREAM_SIGNER_DUAL_ATTESTER_AND_ARCHIVE_SECRETS_INSTALLED=true/);
});

test("commercial reviewer binding is dynamic, independently keyed and fail-closed",()=>{
 assert.match(workflow,/GEOMACRO_RELEASE_REVIEWER_SERVICE: \$\{\{ vars\.GEOMACRO_RELEASE_REVIEWER_SERVICE \|\| '' \}\}/);
 assert.match(workflow,/GEOMACRO_RELEASE_REVIEWER_SERVICE_REQUIRED/);
 assert.match(workflow,/config\.services\.push\(\{binding:'GEOMACRO_RELEASE_REVIEWER',service:reviewerService\}\)/);
 assert.match(workflow,/GEOMACRO_RELEASE_REVIEWER_KEY_NOT_INDEPENDENT/);
 assert.match(issuer,/export function commercialIssuerEnabled\(env\)/);
 assert.match(issuer,/typeof env\.GEOMACRO_RELEASE_REVIEWER\?\.fetch==="function"/);
 assert.doesNotMatch(example,/"binding": "GEOMACRO_RELEASE_REVIEWER"/);
});

test("deployment wiring keeps Store checkout default off",()=>{
 assert.match(workflow,/GEOMACRO_STORE_CHECKOUT_ENABLED: \$\{\{ vars\.GEOMACRO_STORE_CHECKOUT_ENABLED \|\| '' \}\}/);
 assert.doesNotMatch(example,/"GEOMACRO_STORE_CHECKOUT_ENABLED": "YES"/);
});
