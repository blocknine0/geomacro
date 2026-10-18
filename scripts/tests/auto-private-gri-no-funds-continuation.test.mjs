import {readFileSync} from "node:fs";
import {test} from "node:test";
import {strict as assert} from "node:assert";

const workflow=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
const pulse=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
const preflight=readFileSync("scripts/ops/preflight-private-griv12-singleton.mjs","utf8");

test("only genuine D1 novel original wakeup can enter automatic three-domain GRI private preflight",()=>{
  assert.match(pulse,/needs\.original-publisher-pulse\.outputs\.private_scoring_needed == 'true'/u);
  assert.match(pulse,/bounded_automatic_private_stage: true/u);
  assert.match(workflow,/id: automatic_gri_singleton\n\s+if: >-\n\s+steps\.headroom\.outputs\.admitted == 'true' &&\n\s+inputs\.bounded_automatic_private_stage == true/u);
  assert.match(workflow,/node scripts\/ops\/preflight-private-griv12-singleton\.mjs/u);
  assert.match(preflight,/candidate\.records\.length!==1/u);
  assert.match(preflight,/source\.records\.length!==1/u);
  assert.match(preflight,/for\(const category of STAGE_DOMAINS\)/u);
  assert.match(preflight,/makePrivateGriCompanionBundle/u);
  assert.match(preflight,/buildPrivateGriSingletonSourceBridge/u);
});
test("automatic proof cannot turn a single issuer into public current scored GRI or customer charge",()=>{
  const gate=workflow.split("id: automatic_gri_singleton")[1]?.split("\n      - name: Prove genuine original-source")[0]??"";
  for(const pin of [
    "receipt.accepted!==true", "receipt.private_only!==true",
    "receipt.public_published!==false", "receipt.commercial_eligible!==false",
    "receipt.independently_corroborated!==false",
    "receipt.source_rights_verified!==false",
    "receipt.source_authenticity_independently_verified!==false",
    "receipt.remote_network_calls!==0",
    "receipt.b2_requests!==0", "receipt.d1_writes!==0",
    "receipt.supabase_writes!==0", "receipt.usdc_spent!==0",
    "PRIVATE_GRI_NOT_READY_THREE_GENUINE_SINGLETON_ORIGINALS_REQUIRED",
  ])assert.ok(gate.includes(pin),pin);
  assert.equal((workflow.match(/steps\.automatic_gri_singleton\.outputs\.eligible == 'true'/gu)??[]).length,3);
  assert.ok(workflow.includes("PRIVATE_GRI_THREE_DOMAIN_SINGLETON_READY_NO_COMMERCIAL_RIGHTS"));
  assert.ok(!gate.includes("RISK_OBJECT_SIGNING_PRIVATE_KEY"));
  assert.ok(!gate.includes("publish-supabase-free-global-risk.mjs"));
  assert.ok(!gate.includes("COINBASE_API_KEY"));
  assert.ok(!gate.includes("SUPABASE_URL:"));
});
test("B2 preflight is zero-network, no secret source payload leaks, and manual bounded workflow remains",()=>{
  const gate=workflow.split("id: automatic_gri_singleton")[1]?.split("\n      - name: Prove genuine original-source")[0]??"";
  for(const pin of [
    "env -u B2_KEY_ID -u B2_APPLICATION_KEY",
    "-u CLOUDFLARE_API_TOKEN -u GEOMACRO_COMMERCE_LEDGER_TOKEN",
    ">/tmp/geomacro-auto-private-gri-admission.json 2>/dev/null",
    "JSON.stringify([","geopolitics","macro","rare_earth",
  ])assert.ok(gate.includes(pin),pin);
  assert.ok(workflow.includes("github.event.inputs.private_gri_singleton == 'true'"));
  assert.ok(workflow.includes("B2_ACCOUNT_QUOTA_WORKFLOW_ID: gri_private_v12"));
  assert.ok(workflow.includes("public_published:false,commercial_eligible:false"));
});
