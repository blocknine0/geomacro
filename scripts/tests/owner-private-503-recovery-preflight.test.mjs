import test from "node:test";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {owner503RecoveryPreflight,inspectOwnerArtifact} from "../ops/owner-private-503-recovery-preflight.mjs";

test("absent real signed/rights inputs never turn health or x402 green",()=>{
 const r=owner503RecoveryPreflight({});
 assert.equal(r.intelligence_immutable_input,"NOT_PROVIDED");
 assert.equal(r.gri_input_files.country_category_certificates,"NOT_PROVIDED");
 assert.equal(r.production_b2_d1_readback_checked,false);
 assert.equal(r.deep_health_200_verified,false);
 assert.equal(r.actual_grants_or_original_html_checked,false);
 assert.equal(r.next_required_actions.includes("PROVIDE_REAL_THREE_DOMAIN_DUAL_SIGNED_INTELLIGENCE_BATCH"),true);
 assert.equal(r.real_payments,0);
});
test("exact local SHA reads only secure private bytes and never emits paths/hashes",()=>{
 const root=mkdtempSync(join(tmpdir(),"owner-private-503-"));
 try{
  const path=join(root,"signed-batch.json");
  const bytes=Buffer.from('{"signed_test_fixture_only":true}'.repeat(8));
  writeFileSync(path,bytes,{mode:0o600});chmodSync(path,0o600);
  const sha=createHash("sha256").update(bytes).digest("hex");
  const env={GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT:path,GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256:sha};
  const state=owner503RecoveryPreflight(env);
  assert.equal(state.intelligence_immutable_input,"EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED");
  assert.equal(state.actual_facts_or_rights_signatures_checked,false);
  const text=JSON.stringify(state);
  assert.equal(text.includes(path),false);
  assert.equal(text.includes(sha),false);
  assert.equal(text.includes("signed_test_fixture"),false);
  assert.equal(inspectOwnerArtifact({...env,GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256:"f".repeat(64)},
    "GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT","GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256"),
    "LOCAL_BYTES_PIN_MISMATCH");
  chmodSync(path,0o644);
  assert.equal(inspectOwnerArtifact(env,"GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT",
    "GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256"),"PRIVATE_FILE_UNSAFE_OR_MISSING");
 }finally{rmSync(root,{recursive:true,force:true})}
});
test("configured pin metadata still does not prove source licences or final hot serving",()=>{
 const sha1="a".repeat(64),sha2="b".repeat(64);
 const env={
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:sha1,
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:sha2,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:"PRIVATE TEST PUBLIC PEM",
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:"PRIVATE TEST PUBLIC PEM",
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:"TEST PUBLIC KEY",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"machine_intelligence_signed_staging",
  B2_REQUEST_BUDGET:"6",B2_KEY_ID:"secret test",B2_APPLICATION_KEY:"secret test",
  CLOUDFLARE_ACCOUNT_ID:"secret test",CLOUDFLARE_API_TOKEN:"secret test",
  D1_DATABASE_ID:"secret test",GEOMACRO_COMMERCE_LEDGER_TOKEN:"s".repeat(40),
 };
 const good=owner503RecoveryPreflight(env);
 assert.equal(good.environment.different_facts_and_rights_public_pins_present,true);
 assert.equal(good.environment.signed_intelligence_quota_governed,true);
 assert.equal(good.environment.protected_b2_configured,true);
 assert.equal(good.deep_health_200_verified,false);
 assert.equal(good.actual_facts_or_rights_signatures_checked,false);
 assert.equal(JSON.stringify(good).includes("secret test"),false);
 const bad=owner503RecoveryPreflight({...env,
   GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:sha1,COINBASE_X402_MAINNET_ACK:"YES"});
 assert.equal(bad.environment.different_facts_and_rights_public_pins_present,false);
 assert.equal(bad.environment.no_supabase_no_coinbase_no_real_money_ack,false);
 assert.equal(bad.next_required_actions[0],"REMOVE_FORBIDDEN_FUNDS_OR_SUPABASE_ENVIRONMENT");
});
