import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {safeFreeSourceProductionFailure} from "./free-source-production-failure.mjs";

test("map known D1 source checkpoint failures without leaking raw errors",()=>{
 const examples=new Map([
  ["D1_CONTROL_STATE_CLOUDFLARE_API_TOKEN_REQUIRED","D1_TOKEN_CONFIGURATION_MISSING"],
  ["D1_CONTROL_STATE_QUERY_FAILED:10000","D1_QUERY_REJECTED_OR_AUTHORIZATION_FAILED"],
  ["D1_CONTROL_STATE_QUERY_FAILED:403","D1_QUERY_REJECTED_OR_AUTHORIZATION_FAILED"],
  ["D1_CONTROL_STATE_QUERY_RESULT_INVALID","D1_QUERY_RESPONSE_SHAPE_INVALID"],
  ["FREE_SOURCE_UPDATE_PREVIOUS_STATE_INVALID","D1_EXISTING_CHECKPOINT_SCHEMA_OR_HASH_INVALID"],
  ["FREE_SOURCE_UPDATE_READBACK_MISMATCH","D1_CHECKPOINT_POST_WRITE_READBACK_MISMATCH"],
  ["FREE_SOURCE_PUBLISHER_READBACK_OR_RECEIPT_INVALID","SOURCE_RECEIPT_CONTRACT_INVALID"],
 ]);
 for(const [raw,expected] of examples){
  const r=safeFreeSourceProductionFailure(new Error(raw),{phase:"d1_load_and_source_collection"});
  assert.equal(r.failure_code,expected);
  assert.equal(r.d1_checkpoint_readback_verified,false);
  assert.equal(r.three_hot_signed_products_ready,false);
  assert.equal(r.external_payment_performed,false);
  assert.equal(r.raw_source_or_secrets_in_receipt,false);
  assert.equal(JSON.stringify(r).includes(raw),false);
 }
});
test("arbitrary private URLs, tokens, SQL, row metadata or source content cannot leave known enum",()=>{
 const privateText="https://secret.example/private?sig=EXPOSE-ME";
 for(const e of [
  new Error("fetch failed "+privateText),
  new Error("D1_CONTROL_STATE_QUERY_FAILED: "+privateText),
  new Error("FREE_SOURCE_UPDATE_PRIVATE_DETAIL_"+privateText),
  {message:privateText},
  privateText,
  null,
 ]){
  const r=safeFreeSourceProductionFailure(e,{phase:privateText});
  const encoded=JSON.stringify(r);
  assert.equal(encoded.includes(privateText),false);
  assert.equal(encoded.includes("EXPOSE-ME"),false);
  assert.equal(r.phase,"unknown_protected_phase");
  assert.ok(r.failure_code.length>5);
 }
});
test("actual protected source collection retains failure artifact and no modified payment/signature gate",()=>{
 const script=readFileSync(new URL("../ops/probe-commercial-free-source-lineup.mjs",import.meta.url),"utf8");
 assert.match(script,/safeFreeSourceProductionFailure\(error,\{phase\}\)/);
 assert.match(script,/artifacts\/free-source-updates\/receipt\.json/);
 assert.match(script,/PRODUCTION_FREE_SOURCE_UPDATES_FAILED_CLOSED/);
 assert.doesNotMatch(script,/console\.(?:log|error)\(error(?:\.stack|\.message)?\)/);
 const workflow=readFileSync(new URL("../../.github/workflows/free-commercial-source-lineup.yml",import.meta.url),"utf8");
 assert.match(workflow,/if: always\(\)/);
 assert.match(workflow,/free-source-updates\/receipt\.json/);
});
