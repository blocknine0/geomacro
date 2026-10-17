import test from "node:test";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {mkdtempSync,chmodSync,writeFileSync,symlinkSync,existsSync,rmSync}
 from "node:fs";
import {runOfflineMachineIssuerCli}
 from "./issue-offline-machine-commercial-proof.mjs";
function secureFixture(){
 const root=mkdtempSync(join(tmpdir(),"geomacro-role-"));
 chmodSync(root,0o700);
 const input=join(root,"issuer.json");
 writeFileSync(input,JSON.stringify({
  schema:"geomacro.offline-issuer-submission.v1",
  proof:{},candidates:[],review:{},
  review_document_file:"review.txt",
 }),{mode:0o600});
 return {root,input,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test("no role-specific pre-existing PEM never creates an output or signs",async()=>{
 const f=secureFixture();
 try{
  await assert.rejects(runOfflineMachineIssuerCli([
   "--mode=issue","--role=facts","--input=issuer.json","--out=signature.json",
  ],{GEOMACRO_OFFLINE_AUTHORITY_ROOT:f.root}),
   /GEOMACRO_OFFLINE_ISSUER_FAILED_CLOSED/);
  assert.equal(existsSync(join(f.root,"signature.json")),false);
 }finally{f.cleanup()}
});
test("issuer input must be 0600, cannot be group-readable",async()=>{
 const f=secureFixture();
 try{
  chmodSync(f.input,0o644);
  await assert.rejects(runOfflineMachineIssuerCli([
   "--mode=issue","--role=rights","--input=issuer.json","--out=receipt.json",
  ],{GEOMACRO_OFFLINE_AUTHORITY_ROOT:f.root}),
   /GEOMACRO_OFFLINE_ISSUER_FAILED_CLOSED/);
  assert.equal(existsSync(join(f.root,"receipt.json")),false);
 }finally{f.cleanup()}
});
test("issuer refuses symlink input and insecure or repo-relative roots",async()=>{
 const f=secureFixture();
 try{
  symlinkSync(f.input,join(f.root,"alias.json"));
  await assert.rejects(runOfflineMachineIssuerCli([
   "--mode=assemble","--input=alias.json","--out=receipt.json",
  ],{GEOMACRO_OFFLINE_AUTHORITY_ROOT:f.root}),
   /GEOMACRO_OFFLINE_ISSUER_FAILED_CLOSED/);
  chmodSync(f.root,0o755);
  await assert.rejects(runOfflineMachineIssuerCli([
   "--mode=assemble","--input=issuer.json","--out=receipt.json",
  ],{GEOMACRO_OFFLINE_AUTHORITY_ROOT:f.root}),
   /GEOMACRO_OFFLINE_ISSUER_FAILED_CLOSED/);
  assert.equal(existsSync(join(f.root,"receipt.json")),false);
 }finally{f.cleanup()}
});
test("reject unknown CLI flags, file traversal and inline secret arguments",async()=>{
 const f=secureFixture();
 try{
  for(const args of [
   ["--mode=issue","--role=facts","--input=../../secrets.txt","--out=x.json"],
   ["--mode=assemble","--input=issuer.json","--out=../x.json"],
   ["--mode=issue","--role=facts","--input=issuer.json","--out=x.json",
    "--private-key=INSERT_SECRET"],
  ])await assert.rejects(runOfflineMachineIssuerCli(args,{
   GEOMACRO_OFFLINE_AUTHORITY_ROOT:f.root,
  }),/GEOMACRO_OFFLINE_ISSUER_FAILED_CLOSED/);
 }finally{f.cleanup()}
});
