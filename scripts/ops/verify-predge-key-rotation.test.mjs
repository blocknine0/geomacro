import test from "node:test";
import assert from "node:assert/strict";
import {PREDGE_ATTESTATION_PUBLIC_KEY,trustedPredgeKey} from "./verify-predge-signed-market.mjs";
import {verifyPredgeRotationRegistry} from "./verify-predge-key-rotation.mjs";
const OLD="13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9";
const item=(key,status="active",active=true)=>({kid:key.slice(0,16),public_key:key,
  algorithm:"ed25519",role:"attestation",active,status});
const registry=()=>({keys:[item(PREDGE_ATTESTATION_PUBLIC_KEY),item(OLD,"revoked",false)]});
test("active code pin accepted and revoked previous key untrusted",()=>{
  const r=registry();const x=verifyPredgeRotationRegistry(r);
  assert.equal(x.kid,PREDGE_ATTESTATION_PUBLIC_KEY.slice(0,16));
  assert.equal(x.known_compromised_key_trusted,false);
  assert.throws(()=>trustedPredgeKey(r,OLD),/UNTRUSTED_SIGNING_KEY/);
});
test("absent or inactive pinned key rejected",()=>{
  assert.throws(()=>verifyPredgeRotationRegistry({keys:[item(OLD,"revoked",false)]}),/UNTRUSTED_SIGNING_KEY/);
  assert.throws(()=>verifyPredgeRotationRegistry({keys:[item(PREDGE_ATTESTATION_PUBLIC_KEY,"revoked",false)]}),/KEY_NOT_ACTIVE/);
});
test("old compromised key cannot be reactivated",()=>{
  const r=registry();r.keys[1]=item(OLD);
  assert.throws(()=>verifyPredgeRotationRegistry(r),/COMPROMISED_KEY_STILL_TRUSTED/);
});
test("role confusion or duplicate current key rejected",()=>{
  const r=registry();r.keys[0].role="cachet-oracle";
  assert.throws(()=>verifyPredgeRotationRegistry(r),/KEY_NOT_ACTIVE/);
  const d=registry();d.keys.push(item(PREDGE_ATTESTATION_PUBLIC_KEY));
  assert.throws(()=>verifyPredgeRotationRegistry(d),/KEY_NOT_ACTIVE/);
});
test("registry may omit a fully revoked previous key",()=>{
  assert.equal(verifyPredgeRotationRegistry({keys:[item(PREDGE_ATTESTATION_PUBLIC_KEY)]}).known_compromised_key_trusted,false);
});
