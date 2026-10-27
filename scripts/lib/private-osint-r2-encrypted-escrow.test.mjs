import test from "node:test";
import assert from "node:assert/strict";
import {sealPrivateOsintSpool} from "./private-osint-encrypted-spool.mjs";
import {mirrorEncryptedOsintToPrivateR2,privateOsintR2Config,
 privateOsintR2ObjectKey,PRIVATE_OSINT_R2_RECEIPT_SCHEMA}
 from "./private-osint-r2-encrypted-escrow.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";

const now=new Date("2026-10-27T19:30:00.000Z");
const root="NOT-REAL-private-root-test-token-"+("a".repeat(40));
const env={CLOUDFLARE_ACCOUNT_ID:"b".repeat(32),
 GEOMACRO_PRIVATE_OSINT_R2_BUCKET:"geomacro-private-osint-stage",
 GEOMACRO_PRIVATE_OSINT_R2_ACCESS_KEY_ID:"c".repeat(32),
 GEOMACRO_PRIVATE_OSINT_R2_SECRET_ACCESS_KEY:"d".repeat(64)};
function item(category,title,id){
 return {...normalizeReusableNewsJson({category,text:title,
   country_iso3:"IND",license:"unknown",
   published_at:new Date(now.getTime()-60000).toISOString()}),
   id:"news-"+id.repeat(64)};
}
const observations=[
 item("macro","India monetary inflation central bank interest rate announcement","a"),
 item("rare_earth","India lithium cobalt critical minerals production export policy","b"),
 item("geopolitics","India government security sanctions ceasefire agreement","c"),
];
const envelope=sealPrivateOsintSpool({
 items:observations,root,now:now.getTime()});
test("private R2 escrow performs exact 1 PUT/1 GET without D1/B2/KV or raw source",async()=>{
 const calls=[],storage=new Map();
 const fetchImpl=async(url,options)=>{
  calls.push({url,method:options.method,headers:options.headers});
  assert.equal(new URL(url).hostname,env.CLOUDFLARE_ACCOUNT_ID+".r2.cloudflarestorage.com");
  assert.ok(url.includes("/geomacro-private-osint-stage/geomacro/private-osint-held/v1/"));
  assert.match(options.headers.Authorization,/^AWS4-HMAC-SHA256 Credential=/);
  assert.ok(!options.headers.Authorization.includes(env.GEOMACRO_PRIVATE_OSINT_R2_SECRET_ACCESS_KEY));
  if(options.method==="PUT"){
   const body=Buffer.from(options.body);
   storage.set(url,body);
   return new Response(null,{status:200});
  }
  if(options.method==="GET")return new Response(storage.get(url),{status:200});
  throw Error("UNEXPECTED_NETWORK");
 };
 const receipt=await mirrorEncryptedOsintToPrivateR2({
  envelope,root,env,now,fetchImpl});
 assert.equal(receipt.schema,PRIVATE_OSINT_R2_RECEIPT_SCHEMA);
 assert.equal(receipt.private_ciphertext_written_and_readback_verified,true);
 assert.equal(receipt.source_neutral_items,3);
 assert.equal(receipt.canonical_d1_status,"PENDING_QUOTA_ADMISSION");
 assert.equal(receipt.d1_sql_queries,0);
 assert.equal(receipt.b2_requests,0);
 assert.equal(receipt.kv_requests,0);
 assert.equal(receipt.raw_publisher_bytes_archived,false);
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(x=>x.method),["PUT","GET"]);
 assert.ok(receipt.object_key.startsWith("geomacro/private-osint-held/v1/2026/10/27/"));
 assert.ok(!JSON.stringify(receipt).includes("lithium"));
 const stored=[...storage.values()][0].toString("utf8");
 assert.ok(!stored.includes("India"));
 assert.ok(!stored.includes("news-"));
 assert.ok(stored.includes("aes-256-gcm+gzip"));
});
test("R2 readback mismatch or PUT failure never advertises durable ciphertext",async()=>{
 const mismatch=async(url,opts)=>opts.method==="PUT"?
  new Response(null,{status:200}):
  new Response(Buffer.from("corrupted"),{status:200});
 await assert.rejects(()=>mirrorEncryptedOsintToPrivateR2({
  envelope,root,env,now,fetchImpl:mismatch
 }),/PRIVATE_OSINT_R2_READBACK_SHA256_MISMATCH/);
 const denied=async()=>new Response(null,{status:429});
 await assert.rejects(()=>mirrorEncryptedOsintToPrivateR2({
  envelope,root,env,now,fetchImpl:denied
 }),/PRIVATE_OSINT_R2_PUT_DENIED_OR_QUOTA_LIMIT/);
});
test("missing or invalid dedicated provisioning always fails closed",async()=>{
 for(const bad of [
  {...env,GEOMACRO_PRIVATE_OSINT_R2_BUCKET:"geomacro-public-news"},
  {...env,GEOMACRO_PRIVATE_OSINT_R2_BUCKET:"../evil"},
  {...env,GEOMACRO_PRIVATE_OSINT_R2_BUCKET:undefined},
  {...env,GEOMACRO_PRIVATE_OSINT_R2_SECRET_ACCESS_KEY:undefined},
  {...env,CLOUDFLARE_ACCOUNT_ID:"other"},
 ]){
  assert.throws(()=>privateOsintR2Config(bad),
   /PRIVATE_OSINT_R2_DEDICATED_BUCKET_OR_SCOPED_CREDENTIALS_REQUIRED/);
 }
});
test("stale source clocks, expired envelopes, a wrong encryption key or future clock cannot be R2 mirrored",async()=>{
 const bad=async()=>{throw Error("MUST_NEVER_FETCH")};
 await assert.rejects(()=>mirrorEncryptedOsintToPrivateR2({
  envelope,root:root+"wrong",env,now,fetchImpl:bad,
 }),/OSINT_SPOOL_AUTHENTICATION_FAILED/);
 await assert.rejects(()=>mirrorEncryptedOsintToPrivateR2({
  envelope,root,env,now:new Date(now.getTime()+26*3600000),fetchImpl:bad,
 }),/OSINT_SPOOL_EXPIRED/);
 assert.throws(()=>privateOsintR2ObjectKey({
  ...envelope,created_at:"../../broken"
 }),/PRIVATE_OSINT_R2_ENVELOPE_INVALID/);
});
