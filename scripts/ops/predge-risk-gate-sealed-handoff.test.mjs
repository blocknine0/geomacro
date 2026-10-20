import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac,constants,generateKeyPairSync,privateDecrypt} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolveRiskGateBearer,sealRiskGateBearer,verifyLiveRiskGateBearer,
 RISK_GATE_HMAC_DOMAIN,RISK_GATE_OAEP_LABEL} from "./predge-risk-gate-sealed-handoff.mjs";
const root="R".repeat(48);
const {publicKey,privateKey}=generateKeyPairSync("rsa",{modulusLength:3072,
 publicKeyEncoding:{type:"spki",format:"pem"},
 privateKeyEncoding:{type:"pkcs8",format:"pem"}});
const pub=Buffer.from(publicKey).toString("base64");
test("Risk Gate token has independent HMAC namespace and RSA-OAEP handoff",()=>{
 const token=resolveRiskGateBearer({root});
 assert.equal(token,createHmac("sha256",root).update(RISK_GATE_HMAC_DOMAIN).digest("hex"));
 assert.match(token,/^[a-f0-9]{64}$/);
 assert.notEqual(token,createHmac("sha256",root).update(
   "geomacro-predge-72h-research-only-v2-20261020").digest("hex"));
 const packed=sealRiskGateBearer({root,recipientPublicKeyB64:pub});
 const opened=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash:"sha256",oaepLabel:Buffer.from(RISK_GATE_OAEP_LABEL)},packed).toString("utf8");
 assert.equal(opened,token);
 assert.equal(packed.includes(Buffer.from(token)),false);
});
test("refuses admin, research, root, weak bearer and refuses to seal for wrong RSA key",()=>{
 const admin=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 const research=createHmac("sha256",root).update(
   "geomacro-predge-72h-research-only-v2-20261020").digest("hex");
 for(const override of [root,admin,research,"short","x".repeat(64),"A".repeat(64)]){
   assert.throws(()=>resolveRiskGateBearer({root,override}));
 }
 const short=generateKeyPairSync("rsa",{modulusLength:2048,
   publicKeyEncoding:{type:"spki",format:"pem"}});
 assert.throws(()=>sealRiskGateBearer({root,recipientPublicKeyB64:
   Buffer.from(short.publicKey).toString("base64")}));
});
test("live handoff proves anonymous 401 and only restricted partner token 503-no-GRO",async()=>{
 const token=resolveRiskGateBearer({root}),calls=[];
 const fetcher=async(_url,opt)=>{
  const h=opt.headers.authorization??null;calls.push(h);
  return Response.json(h===null?
     {execution_authorized:false,error:"RISK_GATE_UNAUTHORIZED"}:
     {execution_authorized:false,error:"CURRENT_SIGNED_GRO_UNAVAILABLE"},{
     status:h===null?401:503});
 };
 const result=await verifyLiveRiskGateBearer({root,fetcher});
 assert.deepEqual(result,{authenticated:true,current_signed_gro:false});
 assert.deepEqual(calls,[null,"Bearer "+token]);
 await assert.rejects(()=>verifyLiveRiskGateBearer({root,fetcher:
   async()=>Response.json({execution_authorized:false,error:"RISK_GATE_UNAUTHORIZED"},{status:401})}));
});
test("the handoff is only manual and never publishes plaintext",()=>{
 const workflow=readFileSync(".github/workflows/predge-risk-gate-sealed-handoff.yml","utf8");
 const worker=readFileSync("workers/control-plane/src/predge-risk-gate-d1.mjs","utf8");
 const deploy=readFileSync(".github/workflows/deploy-control-plane-d1.yml","utf8");
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^  schedule:|^  push:|^  pull_request:/m);
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/persist-credentials: false/);
 assert.match(workflow,/retention-days: 1/);
 assert.match(deploy,/geomacro-predge-risk-gate-v1/);
 assert.match(deploy,/geomacro-predge-72h-research-only-v2-20261020/);
 assert.match(worker,/ACTIVE_KEY_SPKI/);
 assert.doesNotMatch(workflow,/::set-output|echo.*ROOT_LEDGER_TOKEN/);
});
