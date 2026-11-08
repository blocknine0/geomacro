/**
 * Physical Stage 1 proof: shadow-bound deployed versions + independent
 * Backblaze B2 GET. No mocks can be presented as a live signed PASS.
 * D1 reads are bounded; B2 uses the canonical shared account governor.
 */
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {createB2Client} from "../ops/b2-s3-client.mjs";

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const HEX=/^[a-f0-9]{64}$/u;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const NEW=/^geomacro-step3-shadow\.[a-z0-9-]+\.workers\.dev$/u;
const LEGACY=/^geomacro-step3-shadow-legacy\.[a-z0-9-]+\.workers\.dev$/u;
const sha=b=>createHash("sha256").update(b).digest("hex");
const fail=x=>{throw Error("STEP3_PHYSICAL_"+x)};
const isIso=x=>typeof x==="string"&&
 /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(x)&&
 Number.isFinite(Date.parse(x));
async function checkedGet(url,{token,fetchImpl=fetch,provider=false}={}){
 let r;
 try{r=await fetchImpl(url,{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,"Cache-Control":"no-store"},
  signal:AbortSignal.timeout(15000)
 })}catch{fail(provider?"CLOUDFLARE_WORKER_SETTINGS_UNAVAILABLE":"WORKER_HTTP_UNAVAILABLE")}
 if(!r||r.status!==200||r.redirected)
  fail(provider?"CLOUDFLARE_WORKER_SETTINGS_UNVERIFIED":"WORKER_READBACK_NOT_200");
 try{return await r.json()}catch{fail("PROVIDER_JSON_INVALID")}
}
export function shadowArchivedSourceQuery(){
 // Only one existing B2-acknowledged canonical original, no full-table census.
 return "SELECT record_id,raw_sha256,b2_object_sha256,b2_archived_at,raw_json "+
  "FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL "+
  "AND b2_archived_at IS NOT NULL ORDER BY record_id ASC LIMIT 1";
}
export async function verifyRealShadowB2Parity({
 env=process.env,source,b2Factory=createB2Client
}={}){
 if(!source||!HEX.test(source.record_id??"")||
    !HEX.test(source.raw_sha256??"")||
    !HEX.test(source.b2_object_sha256??"")||
    !isIso(source.b2_archived_at)||
    typeof source.raw_json!=="string"||
    (env.B2_ARCHIVE_READ_KEY_ID??"").length<12||
    (env.B2_ARCHIVE_READ_APPLICATION_KEY??"").length<16||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1")
  fail("B2_SOURCE_OR_GOVERNED_READ_CREDENTIAL_UNVERIFIED");
 const day=source.b2_archived_at.slice(0,10).replaceAll("-","/");
 const key="geomacro-evidence/v1/private/phase2h-raw-news/"+day+
  "/"+source.b2_object_sha256+".json.gz";
 const client=b2Factory({
  endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",
  accessKey:env.B2_ARCHIVE_READ_KEY_ID,
  secretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY,
  readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY,
  allowedKeyPrefixes:["geomacro-evidence/v1/private/phase2h-raw-news/"]
 });
 let bytes;
 try{bytes=Buffer.from(await client.get(key))}
 catch{fail("INDEPENDENT_B2_FULL_GET_FAILED")}
 if(bytes.length<64||bytes.length>4_000_000||
    sha(bytes)!==source.b2_object_sha256)
  fail("INDEPENDENT_B2_BYTES_OR_SHA256_MISMATCH");
 let parsed;try{
  parsed=JSON.parse(gunzipSync(bytes,{maxOutputLength:4_000_000}).toString("utf8"));
 }catch{fail("INDEPENDENT_B2_GZIP_OR_JSON_INVALID")}
 if(parsed?.schema!=="geomacro.phase2h.private-raw-b2-object.v1"||
    !Array.isArray(parsed.rows)||parsed.rows.length!==parsed.record_count||
    parsed.rows.length<1||parsed.rows.length>300)
  fail("INDEPENDENT_B2_MANIFEST_INVALID");
 const match=parsed.rows.filter(row=>row.record_id===source.record_id);
 let original;
 try{original=JSON.parse(source.raw_json)}catch{fail("CANONICAL_SOURCE_JSON_INVALID")}
 if(match.length!==1||match[0].raw_sha256!==source.raw_sha256||
    original.record_id!==source.record_id||
    original.raw_sha256!==source.raw_sha256||
    JSON.stringify(match[0])!==JSON.stringify(original))
  fail("INDEPENDENT_B2_ORIGINAL_IDENTITY_MISMATCH");
 return Object.freeze({
  status:"PASS_REAL_B2_BYTE_READBACK",
  original_record_id_sha256:sha(source.record_id),
  b2_object_sha256:source.b2_object_sha256,
  b2_bytes_sha256_verified:true,
  b2_original_identity_verified:true,
  independent_b2_full_get_verified:true,
  b2_governor_required:true
 });
}
async function workerDeployment(host,{env,fetchImpl}){
 const script=host.split(".")[0],account=env.CLOUDFLARE_ACCOUNT_ID;
 const base="https://api.cloudflare.com/client/v4/accounts/"+account+
  "/workers/scripts/"+encodeURIComponent(script);
 const settings=await checkedGet(base+"/settings",{
  token:env.CLOUDFLARE_API_TOKEN,fetchImpl,provider:true});
 if(settings.success!==true||!Array.isArray(settings.result?.bindings))
  fail("WORKER_SETTINGS_RESPONSE_INVALID");
 const matches=settings.result.bindings.filter(b=>b.type==="d1"&&b.name==="DB"&&
  b.database_id?.toLowerCase()===env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase());
 if(matches.length!==1)fail("WORKER_NOT_BOUND_TO_SHADOW_UUID");
 if(host===env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST){
  const r2=settings.result.bindings.filter(b=>
   b.type==="r2_bucket"&&b.name==="PHASE2H_PRIVATE_R2"&&
   b.bucket_name===env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET);
  if(r2.length!==1)fail("NEW_WORKER_NOT_BOUND_TO_PRIVATE_SHADOW_R2");
 }
 const deployments=await checkedGet(base+"/deployments",{
  token:env.CLOUDFLARE_API_TOKEN,fetchImpl,provider:true});
 const entries=deployments.result?.deployments;
 if(deployments.success!==true||!Array.isArray(entries)||entries.length===0)
  fail("WORKER_DEPLOYMENT_UNVERIFIED");
 const active=[...entries].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
 const versions=active?.versions;
 if(!Array.isArray(versions)||versions.length!==1||
    versions[0].percentage!==100||!UUID.test(versions[0].version_id??""))
  fail("WORKER_VERSION_ROLLOUT_NOT_PINNED");
 return {script,version_id:versions[0].version_id};
}
export async function verifyRealShadowDualWorkers({
 env=process.env,source,fetchImpl=fetch
}={}){
 const modern=env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST,
  old=env.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST;
 if(!NEW.test(modern??"")||!LEGACY.test(old??"")||modern===old||
    !UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")||
    !ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20||
    typeof env.CONTROL_PLANE_TOKEN!=="string"||
    env.CONTROL_PLANE_TOKEN.length<32||
    !HEX.test(source?.record_id??"")||
    !HEX.test(source?.raw_sha256??""))
  fail("TWO_REAL_SHADOW_WORKER_PREREQUISITES_MISSING");
 const [legacyDeploy,newDeploy]=await Promise.all([
  workerDeployment(old,{env,fetchImpl}),
  workerDeployment(modern,{env,fetchImpl})
 ]);
 if(legacyDeploy.script===newDeploy.script)
  fail("WORKER_VERSIONS_NOT_DISTINCT");
 const legacy=await checkedGet("https://"+old+
  "/v1/internal/phase2h-raw-news?question=probe&record_id="+
  source.record_id,{token:env.CONTROL_PLANE_TOKEN,fetchImpl});
 if(legacy?.ok!==true||
    legacy.schema!=="geomacro.phase2h.private-question-fivepart.v1"||
    !Array.isArray(legacy.question_matches)||
    !legacy.question_matches.some(x=>
     x.record_id===source.record_id&&x.category&&
     x.archive_d1_ack_present===true)||
    legacy.paid_eligible!==false)
  fail("LEGACY_WORKER_D1_READ_AFTER_EXPAND_FAILED");
 const modernRead=await checkedGet("https://"+modern+
  "/v1/internal/phase2h-raw-object-ref?record_id="+source.record_id,
  {token:env.CONTROL_PLANE_TOKEN,fetchImpl});
 if(modernRead?.ok!==true||
    modernRead.schema!=="geomacro.phase2h.private-r2-reference-readback.v1"||
    modernRead.pointer_and_object_verified!==true||
    modernRead.legacy_fallback!==false||
    modernRead.record?.record_id!==source.record_id||
    modernRead.record?.raw_sha256!==source.raw_sha256||
    modernRead.paid_eligible!==false)
  fail("NEW_WORKER_R2_HYDRATION_FAILED");
 return Object.freeze({
  status:"PASS_REAL_DISTINCT_SHADOW_WORKER_ROLLBACK_READBACK",
  legacy_worker_rollback_verified:true,
  new_worker_hydration_verified:true,
  shadow_d1_provider_binding_verified:true,
  legacy_deployed_version_id:legacyDeploy.version_id,
  new_deployed_version_id:newDeploy.version_id
 });
}
