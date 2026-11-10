import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {
 phase2hBackupHour,phase2hBackupHourKey,sealPhase2hR2Backup,
 openPhase2hR2Backup,sealPhase2hBackupCursor,openPhase2hBackupCursor,
 PHASE2H_R2_CURSOR_KEY
} from "../lib/phase2h-b2-r2-backup.mjs";
import {backupPhase2hPrivateOriginals}
 from "../ops/phase2h-r2-b2-quota-backup.mjs";
const SHA="a".repeat(40),SECRET=Buffer.alloc(32,11).toString("base64");
const NOW=new Date("2026-11-10T18:15:01.000Z");
const rec=(id,time="2026-11-10T18:06:00.000Z")=>({
 schema:"geomacro.phase2h.private-raw-observation.v1",
 record_id:String(id).padStart(64,"0"),raw_sha256:"b".repeat(64),
 ingested_at:time,category:"geopolitics",
 original:{original_title:"PRIVATE example event "+id,
  original_published_at:"2026-11-10T17:44:00.000Z"},
 commercial_rights_verified:false,commercial_delivery_authorized:false
});
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"schedule",
 GITHUB_SHA:SHA,GITHUB_TOKEN:"ghs_"+ "x".repeat(36),
 CLOUDFLARE_ACCOUNT_ID:"c".repeat(32),
 CLOUDFLARE_API_TOKEN:"z".repeat(32),
 GEOMACRO_D1_RECOVERY_R2_BUCKET:"geomacro-private-recovery",
 GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"YES",
 GEOMACRO_D1_RECOVERY_AES256_KEY_B64:SECRET,
 GEOMACRO_COMMERCE_LEDGER_TOKEN:"p".repeat(48)
});
test("AES-256-GCM encrypted R2 backup can recover every original without plaintext in object",()=>{
 const rows=[rec(3),rec(1),rec(2)];
 const sealed=sealPhase2hR2Backup({rows,now:NOW,sourceSha:SHA,
  secretB64:SECRET,nonce:Buffer.alloc(12,9)});
 assert.equal(phase2hBackupHour(NOW),"2026-11-10T18:00:00.000Z");
 assert.equal(sealed.key,
  "geomacro/private/phase2h-b2-quota-backup/v1/2026/11/10/18.json.enc");
 assert.equal(sealed.records_count,3);
 assert.doesNotMatch(sealed.body.toString("utf8"),/PRIVATE example event/u);
 const p=openPhase2hR2Backup({body:sealed.body,secretB64:SECRET,
  expectedHour:sealed.hour,expectedSha:SHA});
 assert.equal(p.verified,true);
 assert.deepEqual(p.records.map(x=>x.record_id),
  [1,2,3].map(x=>String(x).padStart(64,"0")));
 assert.equal(p.records[0].original.original_title,"PRIVATE example event 1");
 assert.equal(p.body_sha256,sealed.body_sha256);
 const mutated=JSON.parse(sealed.body.toString("utf8"));
 mutated.tag=Buffer.alloc(16,1).toString("base64");
 assert.throws(()=>openPhase2hR2Backup({
  body:Buffer.from(JSON.stringify(mutated)),secretB64:SECRET,
  expectedHour:sealed.hour,expectedSha:SHA
 }),/PHASE2H_R2_BACKUP_AES_GCM_OR_GZIP_AUTHENTICATION_FAILED/u);
 assert.throws(()=>openPhase2hR2Backup({body:sealed.body,
  secretB64:Buffer.alloc(32,3).toString("base64"),
  expectedHour:sealed.hour,expectedSha:SHA}),
  /PHASE2H_R2_BACKUP_AES_GCM_OR_GZIP_AUTHENTICATION_FAILED/u);
});
test("HMAC cursor prevents replay, rewrites, wrong source SHA or object substitution",()=>{
 const r=rec(21);const key=phase2hBackupHourKey(NOW);
 const sealed=sealPhase2hBackupCursor({sourceSha:SHA,
  hour:phase2hBackupHour(NOW),objectKey:key,
  objectSha:"f".repeat(64),lastClock:r.ingested_at,
  lastId:r.record_id,cycleComplete:false,secretB64:SECRET});
 const cursor=openPhase2hBackupCursor({body:sealed,secretB64:SECRET});
 assert.equal(cursor.object_key,key);
 assert.equal(cursor.last_id,r.record_id);
 assert.doesNotMatch(sealed.toString(),/PRIVATE example/u);
 const fake=JSON.parse(sealed.toString());
 fake.last_id=String(99).padStart(64,"0");
 assert.throws(()=>openPhase2hBackupCursor({
  body:Buffer.from(JSON.stringify(fake)),secretB64:SECRET}),
  /PHASE2H_R2_BACKUP_CURSOR_HMAC_MISMATCH/u);
});
test("reject unqualified, colliding or over-cap original metadata",()=>{
 const x=rec(1);
 for(const invalid of [
  {...x,commercial_rights_verified:true},
  {...x,commercial_delivery_authorized:true},
  {...x,record_id:"bad"}, {...x,ingested_at:"not-a-date"},
  {...x,original:{}}
 ]){
  assert.throws(()=>sealPhase2hR2Backup({
   rows:[invalid],now:NOW,sourceSha:SHA,secretB64:SECRET
  }),/PHASE2H_R2_BACKUP_/u);
 }
 assert.throws(()=>sealPhase2hR2Backup({
  rows:[x,x],now:NOW,sourceSha:SHA,secretB64:SECRET
 }),/PHASE2H_R2_BACKUP_CANONICAL_ORIGINAL_UNVERIFIED/u);
 assert.throws(()=>sealPhase2hR2Backup({
  rows:Array.from({length:26},(_,i)=>rec(i+1)),
  now:NOW,sourceSha:SHA,secretB64:SECRET
 }),/PHASE2H_R2_BACKUP_VERIFIED_ORIGINALS_REQUIRED/u);
});
function stub(){
 const objects=new Map(),calls=[],observed=[];
 const api=async(url)=>{calls.push({kind:"http",url:String(url)});
  if(url.endsWith("/branches/main"))return{
   status:200,redirected:false,json:async()=>({
    name:"main",commit:{sha:SHA}})};
  throw Error("unexpected HTTP "+url);
 };
 const store=async(method,key,ignoredEnv,ignoredFetch,body)=>{
  calls.push({kind:"R2",method,key});
  if(method==="GET")return objects.get(key)??null;
  if(method==="PUT"){objects.set(key,Buffer.from(body));return true;}
  throw Error("unknown method");
 };
 const reader=async(e,f,cursor)=>{
  observed.push(cursor);
  return {rows:[rec(1)],scanned_count:1,
   rejected_unverified_or_expired_count:0,
   scan_complete:true};
 };
 return {objects,calls,observed,api,store,reader};
}
test("real admission flow: exact main + read-only source -> one private R2 PUT, GET, HMAC cursor + 0 B2",async()=>{
 const x=stub();
 const args={env:env(),now:NOW,fetchImpl:x.api,storage:x.store,
  readExportImpl:x.reader,validateBucket:async()=>true};
 const result=await backupPhase2hPrivateOriginals(args);
 assert.equal(result.status,"PASS_PRIVATE_R2_ENCRYPTED_B2_QUOTA_CONTINUITY_BACKUP");
 assert.equal(result.provider_private_r2_put_readback,true);
 assert.equal(result.hmac_cursor_readback,true);
 assert.equal(result.b2_requests,0);
 assert.equal(result.b2_ack_verified,false);
 assert.equal(result.b2_inventory_proven,false);
 assert.equal(result.canary_hold_removed,false);
 assert.equal(result.d1_original_rows_mutated,0);
 assert.equal(result.backed_up_originals,1);
 assert.equal(x.objects.size,2);
 assert.equal(x.calls.filter(c=>c.kind==="R2"&&c.method==="PUT").length,2);
 assert.equal(x.observed[0],null);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE example event|raw_json/u);
 // Same hour, same canonical original: re-GET independently, NO new hour PUT.
 const retry=await backupPhase2hPrivateOriginals(args);
 assert.equal(retry.status,result.status);
 assert.equal(x.calls.filter(c=>c.kind==="R2"&&c.method==="PUT"&&
  c.key!==PHASE2H_R2_CURSOR_KEY).length,1);
 const v=x.objects.get(PHASE2H_R2_CURSOR_KEY);
 assert.equal(openPhase2hBackupCursor({
  body:v,secretB64:SECRET}).cycle_complete,true);
});
test("R2 cursor corruption and provider failure HOLD before any new backup writes",async()=>{
 const x=stub();
 const args={env:env(),now:NOW,fetchImpl:x.api,storage:x.store,
  readExportImpl:x.reader,validateBucket:async()=>true};
 await backupPhase2hPrivateOriginals(args);
 const damaged=JSON.parse(x.objects.get(PHASE2H_R2_CURSOR_KEY));
 damaged.object_sha256="e".repeat(64);
 x.objects.set(PHASE2H_R2_CURSOR_KEY,Buffer.from(JSON.stringify(damaged)));
 await assert.rejects(backupPhase2hPrivateOriginals(args),
  /PHASE2H_R2_BACKUP_CURSOR_HMAC_MISMATCH/u);
 // Revalidate remote exact main before any provider PUT on a changed SHA.
 const y=stub();
 await assert.rejects(backupPhase2hPrivateOriginals({
  ...args,env:{...env(),GITHUB_SHA:"e".repeat(40)},fetchImpl:y.api,
  storage:y.store}),/PHASE2H_R2_BACKUP_EXACT_MAIN_MOVED/u);
 assert.equal(y.objects.size,0);
});
test("no protected credentials or unreviewed event means no provider operations",async()=>{
 for(const change of [
  e=>{e.GITHUB_EVENT_NAME="pull_request";},
  e=>{e.GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED="NO";},
  e=>{e.CLOUDFLARE_API_TOKEN="";},
  e=>{e.GITHUB_REF="refs/heads/dev";}
 ]){
  const e=env(),x=stub();change(e);
  await assert.rejects(backupPhase2hPrivateOriginals({
   env:e,now:NOW,fetchImpl:x.api,storage:x.store,
   readExportImpl:x.reader,validateBucket:async()=>true
  }),/PHASE2H_R2_BACKUP_/u);
  assert.equal(x.calls.length,0);
 }
});
test("backup workflow requires private provider preflight and retains B2/CANARY holds",()=>{
 const workflow=readFileSync(".github/workflows/phase2h-private-r2-b2-quota-backup.yml","utf8");
 const runner=readFileSync("scripts/ops/phase2h-r2-b2-quota-backup.mjs","utf8");
 assert.match(workflow,/environment: production/u);
 assert.match(workflow,/audit-step3-r2-private-exposure\.mjs/u);
 assert.match(workflow,/phase2h-r2-b2-quota-backup\.mjs/u);
 assert.match(workflow,/cancel-in-progress: false/u);
 assert.match(workflow,/GEOMACRO_D1_RECOVERY_AES256_KEY_B64/u);
 assert.doesNotMatch(workflow,/b2.*list|list.*objects|wrangler r2 object delete/iu);
 assert.doesNotMatch(runner,/rm config\/d1-hotspot|wrangler deploy|D1.*INSERT/u);
});
