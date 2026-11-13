import {describe,it,expect} from "vitest";
import {generateKeyPairSync,createPrivateKey,createPublicKey,verify} from "node:crypto";
import {loadPredge0131ReceiptSigner,signPredge0131Receipt} from "../../scripts/ops/predge-0131-receipt-signer.mjs";

describe("Predge 0131 migration receipt signer",()=>{
 const pair=generateKeyPairSync("ed25519");
 const privateDer=pair.privateKey.export({format:"der",type:"pkcs8"});
 const publicB64=pair.publicKey.export({format:"der",type:"spki"}).toString("base64");
 const keySource=privateDer.toString("base64");
 it("accepts a valid compact Ed25519 PKCS8 key without an arbitrary 80-character minimum",()=>{
  expect(keySource.length).toBeLessThan(80);
  expect(loadPredge0131ReceiptSigner({keySource,keyId:"test-key",
   expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64}).publicSpkiB64).toBe(publicB64);
 });
 it("accepts the documented SIGNING_JWK fallback only when it is matching Ed25519",()=>{
  const jwk=JSON.stringify(pair.privateKey.export({format:"jwk"}));
  expect(loadPredge0131ReceiptSigner({keySource:jwk,keyId:"test-key",
   expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64}).publicSpkiB64).toBe(publicB64);
 });
 it("signs the canonical receipt bytes with the pinned signer",()=>{
  const payload={schema:"geomacro.predge-addendum-v2-migration-receipt.v1",status:"PASS"};
  const receipt=signPredge0131Receipt(payload,{keySource,keyId:"test-key",
   expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64});
  const {signature_base64,...signedPayload}=receipt;
  const signer=loadPredge0131ReceiptSigner({keySource,keyId:"test-key",
   expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64});
  expect(verify(null,Buffer.from(JSON.stringify(signedPayload)),
   createPublicKey({key:Buffer.from(publicB64,"base64"),format:"der",type:"spki"}),
   Buffer.from(signature_base64,"base64"))).toBe(true);
 });
 it("fails closed for missing, wrong, or non-Ed25519 keys",()=>{
  expect(()=>loadPredge0131ReceiptSigner({keySource:"",keyId:"test-key",
   expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64})).toThrow("PREDGE_0131_RECEIPT_SIGNER_PRIVATE_KEY_INVALID");
  expect(()=>loadPredge0131ReceiptSigner({keySource,keyId:"wrong",
   expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64})).toThrow("PREDGE_0131_RECEIPT_SIGNER_ID_INVALID");
  const rsa=generateKeyPairSync("rsa",{modulusLength:2048});
  expect(()=>loadPredge0131ReceiptSigner({keySource:rsa.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
   keyId:"test-key",expectedKeyId:"test-key",trustedPublicSpkiB64:publicB64})).toThrow("PREDGE_0131_RECEIPT_SIGNER_ALGORITHM_INVALID");
 });
});
