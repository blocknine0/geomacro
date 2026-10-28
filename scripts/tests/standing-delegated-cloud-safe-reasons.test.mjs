import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeCloudSigningFailure} from "../lib/standing-delegated-cloud-safe-reasons.mjs";

test("exact authority pin and forged reviewer consent failures have safe distinct reasons",()=>{
 for(const reason of [
  "STANDING_DELEGATION_PUBLIC_KEY_PIN_MISMATCH",
  "STANDING_DELEGATION_HUMAN_GOVERNANCE_SIGNATURE_INVALID",
  "STANDING_DELEGATION_AUTHORITY_SEPARATION_FAILED",
  "STANDING_DELEGATION_REAL_DERIVED_READBACK_REQUIRED"
 ]){
  const x=sanitizeCloudSigningFailure(new Error(reason),"PRODUCTION_AUTHORITY_PINS");
  assert.equal(x.reason,reason);
  assert.equal(x.phase,"PRODUCTION_AUTHORITY_PINS");
  assert.equal(x.signature_produced,false);
  assert.equal(x.real_funds_touched,false);
 }
});
test("unknown/provider errors and injected source/key data cannot enter safe receipts",()=>{
 for(const error of [
  new Error("STANDING_DELEGATION_PUBLIC_KEY_PIN_MISMATCH; PEM=secret"),
  new Error("https://private.source.test?token=secret"),
  new Error("-----BEGIN"+" PRIVATE KEY-----"),
  new Error("TypeError: network failed"),
  "STANDING_DELEGATION_PUBLIC_KEY_PIN_MISMATCH"
 ]){
  const s=JSON.stringify(sanitizeCloudSigningFailure(error,"PRIVATE_OUTPUT_WRITE"+"\nsecret"));
  assert.doesNotMatch(s,/private\.source|BEGIN PRIVATE|token=|PEM=|network failed|secret/u);
  assert.match(s,/DELEGATED_CLOUD_UNCLASSIFIED_CRYPTO_OR_IO_FAILURE/u);
  assert.match(s,/UNCLASSIFIED_PHASE/u);
 }
});