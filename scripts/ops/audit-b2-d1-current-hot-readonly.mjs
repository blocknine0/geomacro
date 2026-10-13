#!/usr/bin/env node
// Issue #2124: read-only B2 gzip+proof vs D1 current-hot independent audit.
// No Supabase, B2 PUT, D1 mutation, source payload logging or payment.
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const HASH = /^[0-9a-f]{64}$/;
const PROJECT = "ldpwajisioljyjtojvfx";
const D1 = "https://geomacro-control-plane.daspallab202391.workers.dev";
const BASE = "geomacro-evidence/v1/live/";
const SOURCES = [
  ["intelligence","public-intelligence","geomacro.public-intelligence-live.v1","geomacro.public-intelligence-live-proof.v1",6*3600000],
  ["global-risk","global-risk","geomacro.public-global-risk-live.v1","geomacro.public-global-risk-live-proof.v1",90*60000],
  ["risk-indices","risk-indices-independent","geomacro.public-risk-indices-live.v1","geomacro.public-risk-indices-live-proof.v1",90*60000],
];
const PRODUCTS=SOURCES.map(([name,folder,schema,proof,maxAge])=>({
  name,schema,proof,maxAge,live:BASE+folder+"/latest.json.gz",
  proofKey:BASE+folder+"/latest-proof.json",
}));
function clock(value,now) {
  const n=typeof value==="string"?Date.parse(value):NaN;
  return Number.isFinite(n)&&n<=now+300000?n:null;
}
function originalClock(p,value,now) {
  if(p.name!=="intelligence") return clock(value?.data?.snapshotAsOf,now);
  if(!Array.isArray(value?.rows)||!value.rows.length) return null;
  const times=value.rows.map(r=>clock(r?.published_at,now));
  return times.includes(null)?null:Math.max(...times);
}
function contentValid(p,value,proof,now) {
  if(p.name==="intelligence") {
    const categories=new Set();
    const allowed=new Set(["geopolitics","macro","rare_earth"]);
    if(!Array.isArray(value?.rows)||value.rows.some(r=>{
      categories.add(r?.category);
      return !allowed.has(r?.category)||r?.public_status!=="verified_b2"||
        !Number.isInteger(r?.severity)||r.severity<0||r.severity>100;
    }))return false;
    return categories.size===3 &&
      proof?.commercial_multi_source_verified===true &&
      proof?.current_source_id==="qualified_independent_original_publishers_v1" &&
      proof?.current_evidence_contract==="geomacro.qualified-original-event-claims.v1";
  }
  const data=value?.data;
  if(data?.verificationStatus!=="verified")return false;
  if(p.name==="global-risk")
    return data?.methodologyVersion==="gri-v1.2.0"&&
      data?.auditPersisted===true&&HASH.test(String(data.proofHash??""));
  return data?.parentMethodologyVersion==="gri-v1.2.0"&&
    Array.isArray(data.indices)&&data.indices.length===3&&
    data.indices.every(x=>x.status==="available");
}
const bad = reason => ({ok:false,reason});
export async function auditOne(p,{get,fetchImpl=fetch,now=Date.now()}) {
  let compressed,proofBytes;
  try {
    compressed=await get(p.live);
    proofBytes=await get(p.proofKey);
  }catch{return bad("B2_GET_UNAVAILABLE_OR_QUOTA_HELD");}
  if(!Buffer.isBuffer(compressed)||compressed.length<10||compressed.length>12000000||
     !Buffer.isBuffer(proofBytes)||proofBytes.length>100000)
    return bad("B2_READBACK_BYTES_INVALID");
  let proof,payload,raw;
  const packedHash=sha(compressed);
  try{
    proof=JSON.parse(proofBytes.toString("utf8"));
    raw=gunzipSync(compressed,{maxOutputLength:12000000}).toString("utf8");
    payload=JSON.parse(raw);
  }catch{return bad("B2_EXACT_GZIP_RESTORE_INVALID");}
  if(proof?.schema!==p.proof||proof.live_key!==p.live||
     proof.compressed_sha256!==packedHash||
     proof.compressed_bytes!==compressed.length||
     proof.full_b2_readback_verified!==true||
     proof.exact_gzip_restore_verified!==true||
     proof.generated_at!==payload?.generated_at||
     payload?.schema!==p.schema||payload?.source_project!==PROJECT)
    return bad("B2_PROOF_OR_PAYLOAD_BINDING_INVALID");
  const generated=clock(payload.generated_at,now);
  const source=originalClock(p,payload,now);
  if(generated===null||source===null||source>generated+300000||
     !contentValid(p,payload,proof,now))
    return bad("B2_ORIGINAL_SOURCE_EVIDENCE_INVALID");
  const current=now-source<=p.maxAge;
  let response,hot;
  try{
    response=await fetchImpl(D1+"/v1/public/hot-snapshot/"+p.name,{
      method:"GET",redirect:"error",
      headers:{Accept:"application/json","Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(12000),
    });
    if(response?.status===200){
      const body=await response.text();
      if(body.length<=2000000)hot=JSON.parse(body);
    }
  }catch{/* deliberately redact upstream failure/payload */}
  const status=Number.isInteger(response?.status)?response.status:0;
  const rawHash=sha(Buffer.from(raw));
  // Exact byte and original clock equality: neither poll nor restore can mint freshness.
  const match=status===200&&hot?.ok===true&&hot.product===p.name&&
    hot.schema===p.schema&&hot.proof_schema===p.proof&&
    hot.b2_object_key===p.live&&hot.b2_sha256===packedHash&&
    hot.payload_sha256===rawHash&&hot.payload_json===raw&&
    Date.parse(hot.source_as_of)===source&&
    Date.parse(hot.expires_at)>now&&
    hot.full_b2_readback_verified===true&&
    hot.exact_gzip_restore_verified===true&&
    hot.current_b2_readback_verified!==false&&
    hot.current_b2_snapshot_promoted!==false;
  return {
    ok:current&&match,
    reason:!current?"B2_ORIGINAL_EVIDENCE_STALE":!match?"D1_MISSING_OR_HASH_UNMATCHED":null,
    b2_readback_verified:true,exact_gzip_restore_verified:true,
    b2_sha256:packedHash,payload_sha256:rawHash,
    source_as_of:new Date(source).toISOString(),
    source_age_minutes:Math.max(0,Math.floor((now-source)/60000)),
    original_current:current,d1_http_status:status,d1_hash_and_clock_match:match,
  };
}
export async function auditAll({get,fetchImpl=fetch,now=Date.now()}) {
  const products={};
  for(const p of PRODUCTS) products[p.name]=await auditOne(p,{get,fetchImpl,now});
  return {
    schema:"geomacro.issue2124.b2-d1-readonly-audit.v1",
    checked_at:new Date(now).toISOString(),
    ok:Object.values(products).every(p=>p.ok===true),
    products,b2_puts:0,d1_writes:0,supabase_requests:0,payments:0,
    raw_source_published:false,commercial_acceptance:false,
  };
}
async function main(){
  if(process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
     !process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID||
     !process.env.D1_DATABASE_ID)throw Error("SHARED_D1_B2_GOVERNOR_REQUIRED");
  const accessKey=process.env.B2_ARCHIVE_READ_KEY_ID;
  const secretKey=process.env.B2_ARCHIVE_READ_APPLICATION_KEY;
  if(!accessKey||!secretKey)throw Error("B2_DEDICATED_READ_CONFIG_REQUIRED");
  const {createB2Client}=await import("./b2-s3-client.mjs");
  const b2=createB2Client({
    endpointUrl:"https://s3.us-east-005.backblazeb2.com",
    accessKey,secretKey,bucket:"geomacro-private-archive",
  });
  const report=await auditAll({get:key=>b2.get(key)});
  process.stdout.write(JSON.stringify(report)+"\n");
  if(!report.ok)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(()=>{console.error("ISSUE_2124_READONLY_AUDIT_UNAVAILABLE");process.exitCode=2;});
