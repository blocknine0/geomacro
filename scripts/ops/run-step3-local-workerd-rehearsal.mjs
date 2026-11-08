#!/usr/bin/env node
/**
 * Deterministic offline Workerd/Miniflare schema coexistence exercise.
 * It runs explicit isolated TEST adapters, not the live deployed Worker
 * bundles. The signed local PASS must NEVER be used for Stage 2 D1 admission.
 */
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Miniflare} from "miniflare";
import {signStep3StatusReceipt} from "../lib/d1-step3-recovery-checkpoint.mjs";

const SHA=x=>createHash("sha256").update(x).digest("hex");
const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64);
const at="2026-11-08T10:00:00.000Z";
const localPath="artifacts/release/step3-shadow-local-rehearsal-receipt.json";
const legacyScript=`
export default {
 async fetch(req,env){
  const u=new URL(req.url),id=u.searchParams.get("id");
  if(req.method==="POST"&&u.pathname==="/write"){
   const text=await req.text();
   await env.DB.prepare("INSERT INTO phase2h_private_raw_news(record_id,raw_sha256,raw_json,first_ingested_at) VALUES(?,?,?,?)")
    .bind(id,id,text,"2026-11-08T10:00:00.000Z").run();
   return Response.json({ok:true,written:true});
  }
  const r=await env.DB.prepare("SELECT raw_json FROM phase2h_private_raw_news WHERE record_id=?")
   .bind(id).first();
  return Response.json({ok:!!r,record:r?JSON.parse(r.raw_json):null,legacy:true});
 }
}`;
const newScript=`
export default {
 async fetch(req,env){
  const id=new URL(req.url).searchParams.get("id");
  const p=await env.DB.prepare("SELECT * FROM phase2h_raw_object_refs_v1 WHERE record_id=?")
   .bind(id).first();
  if(!p){
   const old=await env.DB.prepare("SELECT raw_json FROM phase2h_private_raw_news WHERE record_id=?")
    .bind(id).first();
   return Response.json({ok:!!old,record:old?JSON.parse(old.raw_json):null,legacy:true});
  }
  const obj=await env.STAGING_R2.get(p.object_key);
  if(!obj)return new Response("missing object",{status:503});
  const bytes=new Uint8Array(await obj.arrayBuffer());
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(hex!==p.object_sha256||bytes.length!==p.bundle_bytes)
   return new Response("object integrity failure",{status:409});
  const d=JSON.parse(new TextDecoder().decode(bytes));
  const raw=d.records[p.bundle_index];
  const rawHash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  const rawHex=[...new Uint8Array(rawHash)].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(rawHex!==p.record_sha256)return new Response("record integrity failure",{status:409});
  return Response.json({ok:true,record:JSON.parse(raw),legacy:false});
 }
}`;
const fixture=id=>({
 record_id:id,raw_sha256:SHA(id),category:"macro",
 ingested_at:at,original:{original_published_at:at},
 evidence:"OFFLINE LOCAL TEST ONLY ".repeat(24)
});

export async function runLocalWorkerdRehearsal(){
 const temp=mkdtempSync(join(tmpdir(),"geomacro-step3-miniflare-"));
 const config=script=>({
  modules:true,script,compatibilityDate:"2026-10-03",
  d1Databases:{DB:"11111111-2222-4333-8444-555555555555"},
  r2Buckets:["STAGING_R2"],d1Persist:join(temp,"d1"),
  r2Persist:join(temp,"r2")
 });
 let mf;
 try{
  mf=new Miniflare(config(legacyScript));
  const db=await mf.getD1Database("DB");
  await db.exec("CREATE TABLE phase2h_private_raw_news (record_id TEXT PRIMARY KEY, raw_sha256 TEXT NOT NULL, raw_json TEXT NOT NULL, first_ingested_at TEXT NOT NULL)");
  const old=fixture(a),rawOld=JSON.stringify(old);
  let res=await mf.dispatchFetch("http://localhost/write?id="+a,{
   method:"POST",body:rawOld});
  assert.equal(res.status,200);
  assert.equal((await res.json()).written,true);
  // Miniflare D1.exec requires executable SQL per call; skip comment-only lines.
  const ddl=readFileSync("workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql","utf8")
   .split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");
  for(const statement of ddl.split(";").map(x=>x.trim()).filter(Boolean)){
   await db.prepare(statement).run();
  }
  const after=await db.prepare("SELECT name FROM sqlite_schema WHERE name='phase2h_raw_object_refs_v1'").first();
  assert.equal(after.name,"phase2h_raw_object_refs_v1");
  const newer=fixture(b),rawNew=JSON.stringify(newer);
  const bundle=Buffer.from(JSON.stringify({
   schema:"geomacro.phase2h.r2-private-reference-bundle.v1",records:[rawNew]
  }));
  assert(bundle.length>=300);
  const digest=SHA(bundle),key="geomacro/private/phase2h/ref-only/v1/"+digest+".json";
  const bucket=await mf.getR2Bucket("STAGING_R2");
  await bucket.put(key,bundle);
  const read=Buffer.from(await (await bucket.get(key)).arrayBuffer());
  assert(read.equals(bundle),"local R2 byte parity failed");
  const data={
   record_id:b,category:"macro",original_published_at:at,first_ingested_at:at,
   raw_sha256:newer.raw_sha256,object_sha256:digest,object_key:key,
   bundle_bytes:bundle.byteLength,record_sha256:SHA(rawNew),
   record_bytes:Buffer.byteLength(rawNew),bundle_index:0,signed_at:at,
   pointer_hmac_sha256:"0".repeat(64),risk_country_iso3:"USA",
   storage_backend:"private_r2"
  };
  const keys=Object.keys(data);
  await db.prepare("INSERT INTO phase2h_raw_object_refs_v1("+
   keys.join(",")+") VALUES("+keys.map(()=>"?").join(",")+")")
   .bind(...keys.map(k=>data[k])).run();
  await mf.setOptions(config(newScript));
  res=await mf.dispatchFetch("http://localhost/read?id="+a);
  assert.equal((await res.json()).legacy,true);
  res=await mf.dispatchFetch("http://localhost/read?id="+b);
  assert.equal(res.status,200);
  const newRead=await res.json();
  assert.equal(newRead.legacy,false);assert.deepEqual(newRead.record,newer);
  // Roll back the Worker code, not the expand-only D1 schema.
  await mf.setOptions(config(legacyScript));
  res=await mf.dispatchFetch("http://localhost/read?id="+a);
  assert.equal((await res.json()).record.record_id,a);
  res=await mf.dispatchFetch("http://localhost/write?id="+c,{
   method:"POST",body:JSON.stringify(fixture(c))});
  assert.equal(res.status,200);
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const report={
   schema:"geomacro.step3.local-workerd-rehearsal.v1",
   status:"PASS",proof_scope:"LOCAL_SIMULATION_ONLY",
   real_shadow_database_identity_verified:false,
   recovery_checkpoint_verified:false,production_sql_mutated:false,
   worker_fixtures_not_live_bundles:true,
   local_d1_0213_expand_verified:true,
   local_legacy_worker_rollback_verified:true,
   local_new_worker_r2_hydration_verified:true,
   local_r2_byte_parity_verified:true,
   b2_physical_parity_verified:false,
   production_release_authorized:false
  };
  const signed=signStep3StatusReceipt(report,
   JSON.stringify(privateKey.export({format:"jwk"})));
  mkdirSync("artifacts/release",{recursive:true});
  writeFileSync(localPath,JSON.stringify({
   ...signed,local_ephemeral_public_jwk:publicKey.export({format:"jwk"})
  },null,2)+"\n",{mode:0o600});
  return {status:"PASS",proof_scope:report.proof_scope,
   receipt_path:localPath,production_release_authorized:false};
 }finally{
  if(mf)await mf.dispose();
  rmSync(temp,{recursive:true,force:true});
 }
}
if(process.argv[1]&&process.argv[1].endsWith("run-step3-local-workerd-rehearsal.mjs")){
 runLocalWorkerdRehearsal().then(x=>console.log(JSON.stringify(x)),
  err=>{console.error("LOCAL_WORKERD_REHEARSAL_FAILED",err.stack);process.exitCode=1});
}
