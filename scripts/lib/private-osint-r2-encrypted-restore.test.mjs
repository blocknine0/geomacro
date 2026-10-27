import test from "node:test";
import assert from "node:assert/strict";
import {sealPrivateOsintSpool} from "./private-osint-encrypted-spool.mjs";
import {privateOsintR2ObjectKey,readEncryptedOsintFromPrivateR2}
 from "./private-osint-r2-encrypted-escrow.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
const now=new Date("2026-10-27T20:00:00.000Z");
const root="THIS-IS-A-NOT-REAL-TEST-KEY-"+("e".repeat(45));
const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 GEOMACRO_PRIVATE_OSINT_R2_BUCKET:"geomacro-private-osint-backlog",
 GEOMACRO_PRIVATE_OSINT_R2_ACCESS_KEY_ID:"b".repeat(32),
 GEOMACRO_PRIVATE_OSINT_R2_SECRET_ACCESS_KEY:"c".repeat(64)};
const row={...normalizeReusableNewsJson({
 category:"macro",text:"India central bank publishes inflation rate monetary policy update",
 published_at:new Date(now.getTime()-60000).toISOString(),
 license:"unknown",country_iso3:"IND",
}),id:"news-"+("d".repeat(64))};
const sealed=sealPrivateOsintSpool({items:[row],root,now:now.getTime()});
const key=privateOsintR2ObjectKey(sealed);
test("restore exact private R2 ciphertext by sha-addressed key without exposing publisher originals",async()=>{
 let readCount=0;
 const fetchImpl=async(url,options)=>{
  readCount++;
  assert.equal(options.method,"GET");
  assert.ok(url.startsWith("https://"+env.CLOUDFLARE_ACCOUNT_ID+".r2.cloudflarestorage.com/"));
  assert.ok(url.endsWith(key));
  return new Response(JSON.stringify(sealed),{status:200});
 };
 const r=await readEncryptedOsintFromPrivateR2({
  objectKey:key,root,env,now,fetchImpl});
 assert.equal(readCount,1);
 assert.equal(r.verified_ciphertext_from_private_r2,true);
 assert.equal(r.canonical_d1_verified,false);
 assert.equal(r.decoded.items.length,1);
 assert.equal(r.decoded.verified_d1,false);
 assert.equal(r.decoded.items[0].id,row.id);
 assert.equal(r.raw_source_material_returned,false);
});
test("R2 data mutation, credential failure and future/expired native clock all fail before D1",async()=>{
 await assert.rejects(()=>readEncryptedOsintFromPrivateR2({
  objectKey:key,root,env,now,
  fetchImpl:async()=>new Response(JSON.stringify({...sealed,tag:"A".repeat(22)+"=="}),{status:200}),
 }),/PRIVATE_OSINT_R2_RESTORE_OBJECT_SHA256_MISMATCH/);
 await assert.rejects(()=>readEncryptedOsintFromPrivateR2({
  objectKey:key,root,env,now,
  fetchImpl:async()=>new Response(null,{status:404}),
 }),/PRIVATE_OSINT_R2_RESTORE_GET_NOT_VERIFIED/);
 await assert.rejects(()=>readEncryptedOsintFromPrivateR2({
  objectKey:key,root:"WRONG-ROOT-"+root,env,now,
  fetchImpl:async()=>new Response(JSON.stringify(sealed),{status:200}),
 }),/OSINT_SPOOL_AUTHENTICATION_FAILED/);
 await assert.rejects(()=>readEncryptedOsintFromPrivateR2({
  objectKey:key,root,env,now:new Date(now.getTime()+26*3600000),
  fetchImpl:async()=>new Response(JSON.stringify(sealed),{status:200}),
 }),/OSINT_SPOOL_EXPIRED/);
 await assert.rejects(()=>readEncryptedOsintFromPrivateR2({
  objectKey:"https://attacker.example/path",root,env,now,
  fetchImpl:async()=>{throw Error("UNSAFE_FETCH_MUST_NOT_HAPPEN")},
 }),/PRIVATE_OSINT_R2_RESTORE_KEY_INVALID/);
});
