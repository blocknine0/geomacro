import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {prepareFactsPublicPemRepair} from '../ops/repair-approved-facts-public-pem.mjs';
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
  x.privatePem,x.pem.replaceAll('\n','\\n'),x.pem+'-----BEGIN PRIVATE KEY-----',x.pem+'\nEXTRA',
  '',null
 ]) assert.throws(()=>prepareFactsPublicPemRepair({pem,approvedPin:x.pin}),
  /APPROVED_FACTS_PUBLIC_PEM_REPAIR_REFUSED/);
});
