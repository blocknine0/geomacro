#!/usr/bin/env node
/**
 * Owner-only, no-funds independent B2 <-> canonical D1 audit.
 * No mutation and no article/source content ever printed. Limits ensure
 * provider quota is never silently bypassed. A partial scan is FAIL, not 100%.
 */
import {createHash,createDecipheriv} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {digestManifest} from "./hot50-parity-proof.mjs";
import {createB2Client} from "./b2-s3-client.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const HEX=/^[a-f0-9]{64}$/u;
const ORIGIN=String(process.env.GEOMACRO_CONTROL_PLANE_URL||
 "https://geomacro-control-plane.daspallab202391.workers.dev").replace(/\/+$/,"");
const TOKEN=String(process.env.CONTROL_PLANE_TOKEN??"");
const LIMIT=Number(process.env.PARITY_MAX_B2_READS??"12");
let ALLOWED=String(process.env.B2_SPOOL_PREFIX??"geomacro-evidence/v1/spool/");
const BUCKET="geomacro-private-archive";
const ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const fail=code=>{throw Error("ACTIVATION_B2_PARITY_"+code)};
if(!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/iu.test(ORIGIN)||
  !/^[a-f0-9]{64}$/u.test(TOKEN)||
  !Number.isSafeInteger(LIMIT)||LIMIT<1||LIMIT>250||
  !/^(?:[A-Za-z0-9._+-]+\/)*spool\/$/u.test(ALLOWED)||
  String(process.env.B2_SPOOL_ENCRYPTION_KEY??"").length<32||
  process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1")
 fail("CONFIG_UNAVAILABLE");
async function admin(path){
 const r=await fetch(ORIGIN+path,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+TOKEN,Accept:"application/json"},
  signal:AbortSignal.timeout(15000)});
 if(r.status!==200||r.redirected)fail("ADMIN_HTTP_"+r.status);
 const raw=await r.text();
 if(raw.length>500000)fail("ADMIN_OVERSIZED");
 let body;try{body=JSON.parse(raw)}catch{fail("ADMIN_JSON")}
 if(body.ok!==true)fail("ADMIN_INVALID");
 return body;
}
function readManifestSha(bytes,batchSha,count){
 if(bytes.length>1024*1024)fail("B2_OBJECT_OVERSIZED");
 let outer;try{outer=JSON.parse(gunzipSync(bytes,{maxOutputLength:1024*1024}))}
 catch{fail("B2_ENVELOPE_CORRUPT")}
 if(outer.schema!=="geomacro.p0b.encrypted-microbatch.v1"||
   outer.algorithm!=="AES-256-GCM"||
   outer.batch_sha256!==batchSha||outer.item_count!==count||
   !HEX.test(outer.compressed_sha256??""))
   fail("B2_ENVELOPE_MANIFEST_MISMATCH");
 const nonce=Buffer.from(outer.nonce,"base64");
 const cipher=Buffer.from(outer.ciphertext,"base64");
 if(nonce.length!==12||cipher.length<=16)fail("B2_CIPHERTEXT_INVALID");
 const decipher=createDecipheriv("aes-256-gcm",
   createHash("sha256").update(process.env.B2_SPOOL_ENCRYPTION_KEY).digest(),nonce);
 decipher.setAAD(Buffer.from("p0b.bundle|"+batchSha));
 decipher.setAuthTag(cipher.subarray(cipher.length-16));
 let packed;try{packed=Buffer.concat([
   decipher.update(cipher.subarray(0,cipher.length-16)),decipher.final()]);}
 catch{fail("B2_AES_GCM_AUTH_FAILED")}
 if(sha(packed)!==outer.compressed_sha256)fail("B2_COMPRESSED_SHA_MISMATCH");
 let plain;try{plain=gunzipSync(packed,{maxOutputLength:1024*1024})}
 catch{fail("B2_PLAINTEXT_GZIP_INVALID")}
 if(sha(plain)!==batchSha)fail("B2_CANONICAL_PLAINTEXT_SHA_MISMATCH");
 let decoded;try{decoded=JSON.parse(plain.toString("utf8"))}
 catch{fail("B2_MANIFEST_JSON_INVALID")}
 if(decoded.schema!=="geomacro.p0b.microbatch.v1"||
   !Array.isArray(decoded.index)||decoded.index.length!==count||
   new Set(decoded.index.map(x=>x.candidateSha256)).size!==count)
   fail("B2_ITEM_MANIFEST_MISMATCH");
 return true;
}
async function main(){
 const status=await admin("/v1/internal/p0b/status");
 const configured=status.b2_spool_scope?.prefix;
 if(typeof configured!=="string"||!configured.startsWith("geomacro-evidence/v1/")||
  !/^(?:[A-Za-z0-9_-]+\/)*spool\/$/u.test(configured))fail("LIVE_SPOOL_SCOPE_UNAVAILABLE");
 if(process.env.B2_SPOOL_PREFIX&&ALLOWED!==configured)fail("LIVE_SPOOL_SCOPE_MISMATCH");
 ALLOWED=configured;
 const b2=createB2Client({endpointUrl:ENDPOINT,bucket:BUCKET,
 accessKey:process.env.B2_KEY_ID,secretKey:process.env.B2_APPLICATION_KEY,
 allowedKeyPrefixes:[ALLOWED]});

 const census=await admin("/v1/internal/activation/hot50-census");
 if(census.schema!=="geomacro.hot50-production-activation-census.v1")
  fail("CENSUS_SCHEMA_MISMATCH");
 let cursor="",checked=0,seen=new Set(),completed=false;
 const verifiedRows=[];
 while(!completed){

   const page=await admin("/v1/internal/p0b/parity-manifest?limit="+
     25+(cursor?"&after="+cursor:""));
   if(page.schema!=="geomacro.p0b-remote-manifest-page.v1"||
      !Array.isArray(page.rows)||page.rows.length>25)
      fail("D1_PAGE_INVALID");
   for(const item of page.rows){
     if(!HEX.test(item.batch_id)||!HEX.test(item.b2_object_sha256)||
        !item.b2_uri?.startsWith("b2://"+ALLOWED)||
        !Number.isSafeInteger(item.item_count)||item.item_count<1||
        item.item_count>100||seen.has(item.batch_id))
       fail("D1_MANIFEST_INVALID");
     seen.add(item.batch_id);
     const key=item.b2_uri.slice(5);
     if(checked>=LIMIT)fail("READ_BUDGET_PARTIAL");
     const bytes=await b2.get(key); // independent actual B2 S3 GET
     readManifestSha(bytes,item.b2_object_sha256,item.item_count);
     verifiedRows.push(item);checked++;
   }
   const next=page.next_cursor;
   // A full page may be the last; allow one short read to prove completion.
   completed=page.complete===true&&next===null;
   if(!completed){
     if(!HEX.test(next??"")||next===cursor)fail("D1_CURSOR_INVALID");
     cursor=next;
   }
 }
 if(checked!==census.backlog.archived_outboxes)
  fail("D1_ARCHIVED_COUNT_MISMATCH");
 // Repeat the D1 index to detect concurrent change, including
 // count-preserving replacements. B2 listing is prohibited; unindexed B2
 // objects are intentionally not enumerated by this audit.
 const endRows=[];let endCursor="";
 do {
   const page=await admin("/v1/internal/p0b/parity-manifest?limit=25"+(endCursor?"&after="+endCursor:""));
   if(!Array.isArray(page.rows)||endRows.length+page.rows.length>LIMIT)fail("D1_FINAL_MANIFEST_INVALID");
   endRows.push(...page.rows);
   if(page.complete===true&&page.next_cursor===null)break;
   if(!HEX.test(page.next_cursor??"")||page.next_cursor===endCursor)fail("D1_FINAL_CURSOR_INVALID");
   endCursor=page.next_cursor;
 }while(true);
 const manifestSha=digestManifest(verifiedRows);
 if(manifestSha!==digestManifest(endRows))fail("D1_MANIFEST_CHANGED_DURING_AUDIT");
 const after=await admin("/v1/internal/activation/hot50-census");
 if(after.backlog.archived_outboxes!==checked||after.backlog.exact_bundle_journal_mismatch!==0)
   fail("D1_FINAL_CENSUS_MISMATCH");
 const zero=after.backlog.d1_zero_unhandled_proven===true;
 const indexedReadback=checked>0&&checked===census.backlog.archived_outboxes&&
   after.backlog.outbox===0&&after.backlog.exact_bundle_journal_mismatch===0;
 const report={schema:"geomacro.hot50-storage-readback.v1",
   checked_at:new Date().toISOString(),control_plane_origin:ORIGIN,
   head_sha:process.env.GITHUB_SHA??null,run_id:process.env.GITHUB_RUN_ID??null,
   d1_manifest_sha256:manifestSha,stable_d1_manifest_verified:true,
   b2_manifest_sha256:null,stable_b2_manifest_verified:false,
   coverage_scope:"ARCHIVED_ENCRYPTED_P0B_OUTBOX_BATCHES",
   pending_outbox_batches:after.backlog.outbox,
   checked_archived_bundles:checked,d1_archived:census.backlog.archived_outboxes,
   independent_s3_get_sha256_aes_gcm_restoration:checked>0,
   d1_replay_and_journal_census_complete:true,
   physical_bucket_list_complete:false,
   namespace_set_equality_verified:false,
   bidirectional_parity_pass:false,
   d1_indexed_b2_readback_verified:indexedReadback,
   unindexed_b2_objects_enumerated:false,
   ingestion_zero_pending_pass:zero,
   coverage_nonempty_cells:census.coverage.observed_cells,
   coverage_total_cells:150,
   certified_indices_not_inferred:true,
   // This scope is strictly D1-indexed. Never issue a complete parity PASS
   // without authentic full namespace inventory plus bidirectional proof.
   indexed_readback_status:indexedReadback?"PASS":"FAIL",
   status:indexedReadback?"HOLD":"FAIL"};
 console.log(JSON.stringify(report));
 if(report.status!=="PASS")process.exitCode=indexedReadback?3:2;
}
main().catch(error=>{
 console.error(JSON.stringify({schema:"geomacro.hot50-storage-readback.v1",
  status:"FAIL",code:String(error?.message??"UNKNOWN").slice(0,80),
  provider_quota_overrides:false,no_funds:true}));
 process.exitCode=2;
});
