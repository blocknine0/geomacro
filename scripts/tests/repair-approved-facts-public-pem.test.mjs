import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {prepareFactsPublicPemRepair,inspectFactsPublicPemRepair} from '../ops/repair-approved-facts-public-pem.mjs';
function key(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 return {pem:publicKey.export({format:'pem',type:'spki'}).toString(),
 pin:createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex'),
 privatePem:privateKey.export({format:'pem',type:'pkcs8'}).toString()};
}
test('a genuine previously pinned Ed25519 public Facts PEM passes without authorizing pin rotation',()=>{
 const x=key(),p=prepareFactsPublicPemRepair({pem:x.pem,approvedPin:x.pin});
 assert.equal(p.approvedPublicPem,x.pem);
 assert.equal(p.sha256_pin_change_authorized,false);
 assert.equal(p.human_or_machine_private_key_uploaded,false);
 assert.equal(p.payment_authorized,false);
});
test('wrong or absent approved pin and a different public identity fail closed',()=>{
 const x=key(),y=key();
 for(const bad of [null,'',x.pin.toUpperCase(),y.pin,'f'.repeat(64)])
  assert.throws(()=>prepareFactsPublicPemRepair({pem:x.pem,approvedPin:bad}),
    /APPROVED_FACTS_PUBLIC_PEM_REPAIR_REFUSED/);
});
test('private keys, injected PEM content, non-Ed25519 or escaped newlines are refused',()=>{
 const x=key();
 for(const pem of [
  x.privatePem,x.pem.replaceAll('\n','\\n'),x.pem+('-----BEGIN'+' PRIVATE KEY-----'),x.pem+'\nEXTRA',
  '',null
 ]) assert.throws(()=>prepareFactsPublicPemRepair({pem,approvedPin:x.pin}),
  /APPROVED_FACTS_PUBLIC_PEM_REPAIR_REFUSED/);
});

test('read-only diagnostic distinguishes the supplied DER-SPKI base64 from a 64-hex SHA256 pin',()=>{
 const a=key();
 const mistakenBase64='MCowBQYDK2VwAyEA'+ 'A'.repeat(44);
 const result=inspectFactsPublicPemRepair({pem:a.pem,approvedPin:mistakenBase64});
 assert.equal(result.status,'APPROVED_FACTS_PIN_MUST_BE_64_LOWERCASE_HEX_SHA256');
 assert.equal(result.cloud_secrets_written,false);
 assert.equal(result.readiness_jobs_dispatched,false);
 assert.equal(result.signing_authority_verified,false);
 assert.equal(result.real_funds_authorized,false);
 assert.equal(JSON.stringify(result).includes(a.pem),false);
 assert.equal(JSON.stringify(result).includes(a.pin),false);
});
test('read-only diagnostic admits only a genuinely matched existing public identity',()=>{
 const a=key(),other=key();
 const pass=inspectFactsPublicPemRepair({pem:a.pem,approvedPin:a.pin});
 assert.equal(pass.status,'EXISTING_APPROVED_FACTS_PUBLIC_IDENTITY_MATCHED_NO_CHANGE');
 assert.equal(pass.approved_sha256_pin_changed,false);
 assert.equal(pass.public_or_private_key_bytes_returned,false);
 const wrong=inspectFactsPublicPemRepair({pem:other.pem,approvedPin:a.pin});
 assert.equal(wrong.status,'PUBLIC_PEM_OR_APPROVED_FACTS_IDENTITY_MISMATCH');
 assert.equal(wrong.cloud_secrets_written,false);
 assert.equal(JSON.stringify(wrong).includes(other.pem),false);
});
