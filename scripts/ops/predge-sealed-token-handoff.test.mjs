import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,privateDecrypt,constants,createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {
 derivePredgeResearchBearer,decodeRecipientPublicKey,sealPredgeResearchBearer,
 verifyPredgeLiveBearer,PREDGE_HMAC_DOMAIN,PREDGE_OAEP_LABEL,
 PREDGE_RESEARCH_URL,
} from "./predge-sealed-token-handoff.mjs";
const {publicKey,privateKey}=generateKeyPairSync("rsa",{
 modulusLength:3072,publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}
});
const b64=Buffer.from(publicKey).toString("base64"),root="R".repeat(48);
test("Owner alone decrypts dedicated Predge token; root and admin tokens never delivered",()=>{
 const ciphertext=sealPredgeResearchBearer({root,recipientPublicKeyB64:b64});
 const derived=privateDecrypt({key:privateKey,
    padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256",
    oaepLabel:Buffer.from(PREDGE_OAEP_LABEL)},ciphertext).toString("utf8");
 const expected=createHmac("sha256",root).update(PREDGE_HMAC_DOMAIN).digest("hex");
 assert.equal(derived,expected);
 assert.match(derived,/^[0-9a-f]{64}$/);
 assert.ok(!ciphertext.includes(Buffer.from(derived)));
 assert.ok(!ciphertext.includes(Buffer.from(root)));
 assert.notEqual(derived,createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex"));
 assert.equal(decodeRecipientPublicKey(b64).asymmetricKeyType,"rsa");
});
test("Wrong owner's private key cannot retrieve a plaintext handoff",()=>{
 const other=generateKeyPairSync("rsa",{modulusLength:3072});
 const packed=sealPredgeResearchBearer({root,recipientPublicKeyB64:b64});
 assert.throws(()=>privateDecrypt({key:other.privateKey,
   padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256",
   oaepLabel:Buffer.from(PREDGE_OAEP_LABEL)},packed));
});
test("Reject weak/forged RSA key, fake PEM, missing root, arbitrary bearer",()=>{
 const weak=generateKeyPairSync("rsa",{modulusLength:2048,
   publicKeyEncoding:{format:"pem",type:"spki"}});
 assert.throws(()=>decodeRecipientPublicKey(Buffer.from(weak.publicKey).toString("base64")));
 assert.throws(()=>decodeRecipientPublicKey("x".repeat(900)));
 assert.throws(()=>sealPredgeResearchBearer({root:"too short",recipientPublicKeyB64:b64}));
 assert.throws(()=>derivePredgeResearchBearer(""));
});
test("Live research authorization must deny anonymous and admit dedicated Bearer only",async()=>{
 const expected=derivePredgeResearchBearer(root);
 const calls=[];
 const fetchImpl=async(url,options)=>{
   calls.push({url,header:options.headers?.authorization??null});
   if(options.headers?.authorization===undefined)
     return Response.json({ok:false},{status:401});
   return Response.json({ok:true,partner_delivery_schema:"geomacro.predge.research-news-delivery.v1",
     partner_delivery_scope:"PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT",
     partner_resale_or_commercial_redistribution_authorized:false,
     source_licensing_waived:false,chargeable:false,gro_signed:false,items:[]});
 };
 const result=await verifyPredgeLiveBearer({root,fetchImpl});
 assert.equal(result.authenticated_research_verified,true);
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,PREDGE_RESEARCH_URL);
 assert.equal(calls[1].header,"Bearer "+expected);
 assert.equal(calls[0].header,null);
 await assert.rejects(()=>verifyPredgeLiveBearer({root,
   fetchImpl:async()=>Response.json({ok:false},{status:401})}));
});
test("Only manual protected production workflow can create encrypted artifact",()=>{
 const y=readFileSync(".github/workflows/predge-token-only-sealed-handoff.yml","utf8");
 assert.match(y,/  workflow_dispatch:/);
 assert.doesNotMatch(y,/^  schedule:|^  push:|^  pull_request:/m);
 assert.match(y,/environment: production/);
 assert.match(y,/secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN/);
 assert.match(y,/retention-days: 1/);
 assert.match(y,/ref: \$\{\{ github.sha \}\}/);
 assert.match(y,/persist-credentials: false/);
 assert.match(y,/scripts\/ops\/predge-sealed-token-handoff.mjs --seal-after-live-auth/);
 assert.doesNotMatch(y,/::set-output|echo.*ROOT_LEDGER_TOKEN|echo.*PREDGE_RESEARCH_NEWS_TOKEN/);
});
