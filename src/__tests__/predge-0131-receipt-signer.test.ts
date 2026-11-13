import {describe,it,expect} from "vitest";
import {generateKeyPairSync,createPublicKey,verify} from "node:crypto";
import {loadPredge0131ReceiptSigner,signPredge0131Receipt} from "../../scripts/ops/predge-0131-receipt-signer.mjs";

describe("Predge 0131 migration receipt signer",()=>{
 const pair=generateKeyPairSync("ed25519");
 const privateKeyPkcs8B64=pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64");
 const publicKeySpkiB64=pair.publicKey.export({format:"der",type:"spki"}).toString("base64");
 it("accepts compact Ed25519 PKCS8 and checks the matching public key",()=>{
  expect(privateKeyPkcs8B64.length).toBeLessThan(80);
  const signer=loadPredge0131ReceiptSigner({privateKeyPkcs8B64,publicKeySpkiB64});
  expect(signer.keyId).toMatch(/^geomacro-license-ed25519:[a-f0-9]{64}$/);
 });
 it("accepts the configured Ed25519 SIGNING_JWK when the key pair is supplied as JWK",()=>{
  const signingJwk=pair.privateKey.export({format:"jwk"});
  const signer=loadPredge0131ReceiptSigner({signingJwk});
  expect(signer.keyId).toMatch(/^geomacro-license-ed25519:[a-f0-9]{64}$/);
 });
 it("signs exact receipt bytes with Ed25519 and publishes its key fingerprint",()=>{
  const payload={schema:"geomacro.predge-addendum-v2-migration-receipt.v1",status:"PASS"};
  const receipt=signPredge0131Receipt(payload,{privateKeyPkcs8B64,publicKeySpkiB64});
  const publicKey=createPublicKey({key:Buffer.from(receipt.signature_public_key_spki_b64,"base64"),format:"der",type:"spki"});
  expect(receipt.signature_algorithm).toBe("Ed25519");
  expect(verify(null,Buffer.from(JSON.stringify(payload)),publicKey,
   Buffer.from(receipt.signature_base64,"base64"))).toBe(true);
 });
 it("fails closed for missing, mismatched, malformed, or non-Ed25519 keys",()=>{
  expect(()=>loadPredge0131ReceiptSigner({privateKeyPkcs8B64:"",publicKeySpkiB64}))
   .toThrow("PREDGE_0131_RECEIPT_PRIVATE_KEY_REQUIRED");
  expect(()=>loadPredge0131ReceiptSigner({privateKeyPkcs8B64,publicKeySpkiB64:"!"}))
   .toThrow("PREDGE_0131_RECEIPT_KEY_ENCODING_INVALID");
  const other=generateKeyPairSync("ed25519").publicKey.export({format:"der",type:"spki"}).toString("base64");
  expect(()=>loadPredge0131ReceiptSigner({privateKeyPkcs8B64,publicKeySpkiB64:other}))
   .toThrow("PREDGE_0131_RECEIPT_KEY_PAIR_MISMATCH");
  const rsa=generateKeyPairSync("rsa",{modulusLength:2048});
  expect(()=>loadPredge0131ReceiptSigner({
   privateKeyPkcs8B64:rsa.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
   publicKeySpkiB64:rsa.publicKey.export({format:"der",type:"spki"}).toString("base64")
  })).toThrow("PREDGE_0131_RECEIPT_SIGNING_ALGORITHM_INVALID");
 });
});
