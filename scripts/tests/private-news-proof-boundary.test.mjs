import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {readFileSync,mkdtempSync,rmSync,writeFileSync,lstatSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {authorizePrivateNewsProof} from "../../workers/control-plane/src/private-news-proof-auth.mjs";
import {privateNewsProofBearer,storePrivateNewsVerificationReceipt} from "../ops/verify-all-news-signed-publications.mjs";
const root="R".repeat(48);
const h=(key,purpose)=>createHmac("sha256",key).update(purpose).digest("hex");
const control=h(root,"geomacro-control-plane-v1");
const low=h(control,"geomacro-low-source-review-v1");
const valid=h(low,"geomacro-internal-news-proof-read-v1");
const request=token=>new Request("https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/intelligence-publications",{
 headers:token?{authorization:"Bearer "+token}:{},
});
test("authenticated owner-only news proof is strictly separate from PREDGE, admin, low review",async()=>{
 const env={CONTROL_PLANE_TOKEN:control};
 assert.equal(privateNewsProofBearer({GEOMACRO_COMMERCE_LEDGER_TOKEN:root}),valid);
 assert.equal(privateNewsProofBearer({GEOMACRO_LOW_REVIEW_TOKEN:low}),valid);
 assert.equal((await authorizePrivateNewsProof(request(valid),env)).ok,true);
 for(const token of [null,control,low,"f".repeat(64),"PREDGE_RISK_GATE_TOKEN","a".repeat(64)]){
  const r=await authorizePrivateNewsProof(request(token),env);
  assert.equal(r.ok,false);
  assert.equal(r.status,404);
  assert.equal(r.error,"NOT_FOUND");
 }
 assert.deepEqual(await authorizePrivateNewsProof(request(valid),{}),{
  ok:false,status:503,error:"PRIVATE_NEWS_PROOF_UNAVAILABLE"});
});
test("public proof URL is permanently denied and internal route is checked before admin auth",()=>{
 const s=readFileSync("workers/control-plane/src/index.mjs","utf8");
 const i=s.indexOf("if(url.pathname==='/v1/public/intelligence-publications')");
 const j=s.indexOf("if(url.pathname==='/v1/internal/intelligence-publications')");
 assert.ok(i>0&&j>i);
 assert.match(s.slice(i,j),/return json\(\{ok:false,error:"NOT_FOUND"\},404\)/);
 const step=s.slice(j,j+480);
 assert.ok(step.includes("authorizePrivateNewsProof(request,env)"));
 assert.ok(step.indexOf("authorizePrivateNewsProof")<step.indexOf("publicSignedNews(env"));
 assert.ok(step.includes("request.method!=='GET'"));
 const proof=readFileSync("workers/control-plane/src/public-signed-news.mjs","utf8");
 assert.equal(proof.includes("'Access-Control-Allow-Origin':'*'"),false);
 assert.ok(proof.includes("'Cache-Control':'private, no-store'"));
});
test("untrusted party cannot access signed proof through machine public endpoint path",()=>{
 const m=readFileSync("scripts/ops/verify-all-news-signed-publications.mjs","utf8");
 assert.ok(m.includes("/v1/internal/intelligence-publications"));
 assert.equal(m.includes("/v1/public/intelligence-publications"),false);
 assert.ok(m.includes("Authorization:'Bearer '+proofBearer"));
 const safeLog=m.slice(m.indexOf("if(process.argv[1]&&import.meta.url="));
 assert.ok(safeLog.includes("details_redacted:true"));
 assert.equal(safeLog.includes("console.log(JSON.stringify(await verifyAllNewsSignedPublications())"),false);
});
test("private aggregate receipt only written inside runner-temp as exclusive mode 0600",()=>{
 const dir=mkdtempSync(join(tmpdir(),"geomacro-private-news-proof-"));
 try{
  const path=join(dir,"receipt.json");
  storePrivateNewsVerificationReceipt({schema:"TEST_INTERNAL",source_status:"REVIEW_PENDING"},path,{RUNNER_TEMP:dir});
  assert.equal(lstatSync(path).mode&0o077,0);
  assert.deepEqual(JSON.parse(readFileSync(path,"utf8")).schema,"TEST_INTERNAL");
  assert.throws(()=>storePrivateNewsVerificationReceipt({a:1},path,{RUNNER_TEMP:dir}),/EEXIST/);
  assert.throws(()=>storePrivateNewsVerificationReceipt({a:1},join(tmpdir(),"outside.json"),{RUNNER_TEMP:dir}),/PRIVATE_NEWS_PROOF_RECEIPT_PATH_NOT_PRIVATE/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("standing signed verification private receipt is never piped through stdout",()=>{
 const y=readFileSync(".github/workflows/standing-delegated-derived-attestation.yml","utf8");
 assert.ok(y.includes("GEOMACRO_COMMERCE_LEDGER_TOKEN: \${{ secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN }}"));
 assert.ok(!y.includes('verify-all-news-signed-publications.mjs > "$GEOMACRO_VERIFIED_DERIVED_RECEIPT_PATH"'));
 const producer=readFileSync(".github/workflows/five-minute-original-news-fastlane.yml","utf8");
 assert.ok(producer.includes("run: bun scripts/ops/publish-original-news-five-minute-fastlane.ts"));
});
