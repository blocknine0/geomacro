#!/usr/bin/env bun
/**
 * Supabase-free commercial GRO promotion from genuine owner-private,
 * independently attested, canonical signed input.
 *
 * NO signatures generated here; NO raw news, provider URL, credentials or
 * original articles emitted; NO payment. One verified record per invocation.
 * A B2 PUT + independently verified GET precede both parameterized D1 writes.
 * Never creates a record when trust, rights, quota or archive fail.
 */
import {createHash} from "node:crypto";
import {constants,lstatSync,openSync,readFileSync,closeSync} from "node:fs";
import {resolve,isAbsolute} from "node:path";
import {gzipSync,gunzipSync} from "node:zlib";
import {pathToFileURL} from "node:url";
import {canonicalRiskObjectJson,verifyRiskObjectSignature}
  from "../../src/lib/risk-object-signing.server";
import {verifyCommercialRiskObjectArtifact}
  from "../../src/lib/commercial-risk-object-policy";
import {pinnedRiskObjectVerificationKeys}
  from "../../src/lib/risk-object-public-registry";
import {createB2Client} from "./b2-s3-client.mjs";

const FAIL="DIRECT_SIGNED_GRO_D1_PUBLICATION_REFUSED";
const REGEXP=/^[A-Z]{3}$/u;
const sha256=(b:string|Buffer)=>createHash("sha256").update(b).digest("hex");
const B2_ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET="geomacro-private-archive";
const MAX_FILE=512*1024;
type Approved={iso3:string;object:Record<string,any>;objectJson:string;recordSha256:string};
function rejected():never{throw Error(FAIL)}
function record(v:unknown):v is Record<string,any>{
 return v!==null&&typeof v==="object"&&!Array.isArray(v);
}
function exactClock(v:unknown){
 if(typeof v!=="string"||!/Z$/u.test(v))rejected();
 const t=Date.parse(v);
 if(!Number.isFinite(t)||new Date(t).toISOString()!==v)rejected();
 return t;
}
export function validatedOwnerPrivateGRO(raw:string,now=Date.now()):Approved {
 if(!Number.isFinite(now)||Buffer.byteLength(raw,"utf8")>MAX_FILE)rejected();
 let input:unknown;try{input=JSON.parse(raw)}catch{rejected();}
 if(!record(input))rejected();
 let object:Record<string,any>;
 if(input.schema==="geomacro.private-machine-commercial-prepared-gro.v1"){
   if(input.local_signature_verified!==true||
      input.rights_policy_attested!==true||
      input.machine_same_event_attested!==true||
      typeof input.canonical_signed_gro_json!=="string"||
      input.canonical_signed_gro_json.length>MAX_FILE||
      !/^[A-Z]{3}$/.test(input.country_iso3)||
      !/^[a-f0-9]{64}$/.test(input.record_sha256))rejected();
   try{object=JSON.parse(input.canonical_signed_gro_json)}catch{rejected();}
   if(!record(object)||input.record_sha256!==sha256(input.canonical_signed_gro_json))
     rejected();
 }else{
   // Direct reviewer-approved GROs may be passed as full canonical JSON.
   // Same real signature/rights and production trust checks below apply.
   object=input;
 }
 const iso3=String(object?.subject?.id??"");
 if(object.schema_version!=="gro-1.1"||
    object.issuer!=="Geomacro"||
    object.subject?.type!=="country"||!REGEXP.test(iso3)||
    typeof object.object_id!=="string"||object.object_id.length>190||
    !/^[A-Za-z0-9_.:-]{8,190}$/u.test(object.object_id)||
    object.verification?.status!=="VERIFIED"||
    object.commercial_eligibility?.status!=="VERIFIED"||
    object.integrity?.signing_key_id!=="geomacro-risk-2026-03"||
    object.integrity?.canonicalization!=="geomacro-canonical-json-v1"||
    object.integrity?.signature_scheme!=="Ed25519"||
    !Array.isArray(object.evidence)||!object.evidence.length||
    !Number.isFinite(object.risk?.score)||
    !Number.isFinite(object.confidence))rejected();
 const generated=exactClock(object.generated_at),expires=exactClock(object.expires_at);
 if(generated>now||expires<=now||expires<=generated||
    expires-generated>3*3_600_000+300_000)rejected();
 const keys=pinnedRiskObjectVerificationKeys();
 if(!verifyRiskObjectSignature(object as any,keys).valid||
    !verifyCommercialRiskObjectArtifact(object as any,{now:new Date(now),
      verification_keys:keys}).deliverable)rejected();
 const objectJson=canonicalRiskObjectJson(object);
 if(Buffer.byteLength(objectJson,"utf8")>MAX_FILE)rejected();
 const digest=sha256(objectJson);
 if(input.schema==="geomacro.private-machine-commercial-prepared-gro.v1" &&
    input.record_sha256!==digest)rejected();
 return {iso3,object,objectJson,recordSha256:digest};
}

function readPrivateFile(path:string){
 if(!isAbsolute(path))rejected();
 const resolved=resolve(path);
 const st=lstatSync(resolved);
 if(!st.isFile()||st.isSymbolicLink()||st.size<100||st.size>MAX_FILE||
    (process.platform!=="win32"&&(st.mode&0o077)!==0))rejected();
 const fd=openSync(resolved,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{return readFileSync(fd,"utf8")}finally{closeSync(fd)}
}
async function cf(path:string,apiToken:string,method="GET",body?:unknown){
 const r=await fetch("https://api.cloudflare.com/client/v4"+path,{
   method,headers:{authorization:"Bearer "+apiToken,
     accept:"application/json",...(body?{"content-type":"application/json"}:{})},
   body:body?JSON.stringify(body):undefined,redirect:"error",
   signal:AbortSignal.timeout(15_000)});
 const v=await r.json().catch(()=>null) as any;
 if(!r.ok||v?.success!==true)rejected();
 return v;
}
async function cfQuery(account:string,id:string,token:string,batch:{sql:string;params:string[]}[]){
 const response=await cf("/accounts/"+account+"/d1/database/"+id+"/query",
   token,"POST",{batch});
 if(!Array.isArray(response.result)||response.result.length!==batch.length||
    response.result.some((r:any)=>r?.success!==true))rejected();
 return response.result.map((r:any)=>r.results??[]);
}
export async function promoteOwnerPrivateGRO(path:string,now=Date.now()){
 if(process.env.GEOMACRO_DIRECT_GRO_PUBLISH_ACK!=="YES"||
    process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1")rejected();
 const approved=validatedOwnerPrivateGRO(readPrivateFile(path),now);
 const account=String(process.env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(process.env.CLOUDFLARE_API_TOKEN??"");
 const b2id=String(process.env.B2_KEY_ID??"");
 const b2key=String(process.env.B2_APPLICATION_KEY??"");
 if(!/^[a-f0-9]{32}$/u.test(account)||token.length<20||
   !b2id||!b2key)rejected();
 const listing=await cf("/accounts/"+account+"/d1/database?per_page=100",token);
 const databases=(listing.result??[]).filter((d:any)=>d.name==="geomacro-control-plane");
 if(databases.length!==1||typeof databases[0].uuid!=="string")rejected();
 const id=databases[0].uuid;
 const previous=await cfQuery(account,id,token,[{
   sql:"SELECT generated_at FROM country_gro_verified_hot WHERE country_iso3=? LIMIT 1",
   params:[approved.iso3],
 }]);
 if(previous[0]?.[0]?.generated_at &&
    Date.parse(String(previous[0][0].generated_at))>=Date.parse(approved.object.generated_at))
   rejected();
 const packed=gzipSync(Buffer.from(approved.objectJson),{level:9});
 const archiveKey="geomacro-evidence/v1/live/country-gro/hot-bundles/"+
   approved.iso3+"/"+approved.recordSha256+".json.gz";
 const b2=createB2Client({endpointUrl:B2_ENDPOINT,accessKey:b2id,
   secretKey:b2key,bucket:B2_BUCKET});
 // Refuse D1 promotion until real archive GET has proven every byte.
 const archive=await b2.putWithMetadataVerification(archiveKey,packed,{
   verifyRestored:async restored=>{
     if(gunzipSync(restored,{maxOutputLength:MAX_FILE}).toString("utf8")!==approved.objectJson)
       rejected();
   }
 });
 if(archive.full_body_readback_verified!==true)rejected();
 const stamp=new Date(now).toISOString(),o=approved.object;
 const hotSql="INSERT INTO country_gro_verified_hot (country_iso3,object_id,schema_version,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,1,?,?,?) ON CONFLICT(country_iso3) DO UPDATE SET object_id=excluded.object_id,schema_version=excluded.schema_version,generated_at=excluded.generated_at,expires_at=excluded.expires_at,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,archive_write_acknowledged=1,archive_readback_verified=1,object_json=excluded.object_json,verified_at=excluded.verified_at,updated_at=excluded.updated_at WHERE excluded.generated_at > country_gro_verified_hot.generated_at";
 const indexSql="INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status='VERIFIED',commercial_eligibility_status='VERIFIED',signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at";
 await cfQuery(account,id,token,[
   {sql:hotSql,params:[approved.iso3,o.object_id,o.schema_version,
     o.generated_at,o.expires_at,o.integrity.signing_key_id,
     o.integrity.payload_hash,approved.recordSha256,archiveKey,archive.sha256,
     approved.objectJson,stamp,stamp]},
   {sql:indexSql,params:[o.object_id,o.schema_version,"country",approved.iso3,
     o.generated_at,o.expires_at,"VERIFIED","VERIFIED",
     o.integrity.signing_key_id,o.integrity.payload_hash,approved.recordSha256,
     archiveKey,archive.sha256,stamp]},
 ]);
 const readback=await cfQuery(account,id,token,[{
   sql:"SELECT object_id,record_sha256,payload_hash,object_json,archive_sha256,archive_readback_verified FROM country_gro_verified_hot WHERE country_iso3=? LIMIT 1",
   params:[approved.iso3],
 }]);
 const row=readback[0]?.[0];
 if(row?.object_id!==o.object_id||row.record_sha256!==approved.recordSha256||
    row.payload_hash!==o.integrity.payload_hash||row.archive_sha256!==archive.sha256||
    Number(row.archive_readback_verified)!==1||
    sha256(String(row.object_json))!==approved.recordSha256)rejected();
 validatedOwnerPrivateGRO(String(row.object_json),Date.now());
 return Object.freeze({ok:true,schema:"geomacro.direct-signed-gro-d1-acceptance.v1",
   country_iso3:approved.iso3,record_sha256:approved.recordSha256,
   signed_by_canonical_production_key:true,
   commercial_eligibility_verified:true,b2_archive_readback_verified:true,
   d1_exact_readback_verified:true,supabase_requests:0,
   payment_executed:false,execution_authorized:false});
}
if(import.meta.main){
 promoteOwnerPrivateGRO(String(process.argv[2]??"")).then(x=>console.log(JSON.stringify(x)))
 .catch(()=>{console.error(FAIL);process.exitCode=2;});
}
