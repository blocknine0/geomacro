/**
 * GeoMacro direct in-flight 195-country x 3-domain research state engine.
 * No risk-scoring queue or commercial rights inference.
 * Existing source egress, native originals, replay and B2 provenance stay intact.
 * Caller must be trusted server ingestion, NEVER public unverified JSON.
 */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {country195ByIso3} from "../canonical-country-registry-195";

export const RESEARCH_STATE_SCHEMA="geomacro.research-country-risk-snapshot.v1" as const;
export const RESEARCH_PROFILE="RESEARCH_UNVERIFIED" as const;
export type ResearchCategory="geopolitics"|"macro"|"critical_minerals";
export type TrustedResearchEvent=Readonly<{
 country_code:string;severity:number;confidence:number;
 category:ResearchCategory;
 evidence_sha256:string;
 original_published_at:string;
 independent_originals:number;
 trusted_native_originals_verified:true;
 research_use_permitted:true;
 commercial_eligible?:boolean; // never accepted as a source-truth or rights claim
}>;
export type SignedResearchSnapshot=Readonly<{
 schema:typeof RESEARCH_STATE_SCHEMA;profile:typeof RESEARCH_PROFILE;
 country_code:string;version:number;composite_score:number;
 geopolitics_score:number;macro_score:number;critical_minerals_score:number;
 last_evidence_sha256:string;last_event_at:string;
 updated_at:string;generated_at:string;expires_at:string;
 verification_status:"PROVISIONAL_RESEARCH_ONLY";
 commercial_eligible:false;execution_authorized:false;
}>;
type JsonObject=Record<string,unknown>;
const SHA=/^[a-f0-9]{64}$/u;
const CAT=new Set(["geopolitics","macro","critical_minerals"]);
const MAX_AGE_MS=6*3600_000;
const MAX_SIGNED_AGE_MS=3*3600_000;
const SANITIZED=/^[A-Za-z0-9._:-]{4,120}$/u;
function fail(code:string):never{throw Error(code)}
function record(o:unknown):o is JsonObject{
 return !!o&&typeof o==="object"&&!Array.isArray(o);
}
export function canonicalResearchJson(v:unknown):string{
 if(v===null||typeof v==="boolean"||typeof v==="string")return JSON.stringify(v);
 if(typeof v==="number"){
  if(!Number.isFinite(v))fail("RESEARCH_NONFINITE_JSON");
  return JSON.stringify(v);
 }
 if(Array.isArray(v))return "["+v.map(canonicalResearchJson).join(",")+"]";
 if(record(v)){
  if(Object.keys(v).some(k=>k==="__proto__"))fail("RESEARCH_FORBIDDEN_JSON_KEY");
  return "{"+Object.keys(v).sort().map(k=>
    JSON.stringify(k)+":"+canonicalResearchJson(v[k])).join(",")+"}";
 }
 return fail("RESEARCH_NON_JSON_VALUE");
}
export function researchSha256(text:string):string{
 return createHash("sha256").update(text,"utf8").digest("hex");
}
export function riskProjectConfig(env:NodeJS.ProcessEnv=process.env){
 const value=String(env.GEOMACRO_RESEARCH_SUPABASE_URL??"").trim();
 const secret=String(env.GEOMACRO_RESEARCH_SUPABASE_SERVICE_ROLE_KEY??"").trim();
 let u:URL;try{u=new URL(value)}catch{fail("RESEARCH_SUPABASE_URL_UNAVAILABLE")}
 if(u.protocol!=="https:"||u.pathname!=="/"||u.search||u.hash||
    u.username||u.password||!/^[-a-z0-9]+\.supabase\.co$/u.test(u.hostname)||
    secret.length<32)
   fail("RESEARCH_SUPABASE_CREDENTIALS_UNAVAILABLE");
 return {origin:u.origin,secret};
}
async function restJson(path:string,method:"POST"|"GET",payload:unknown,opts:{
 env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch
}={}):Promise<unknown>{
 const {origin,secret}=riskProjectConfig(opts.env);
 let res:Response;
 try{
  res=await (opts.fetchImpl??fetch)(origin+"/rest/v1/"+path,{
   method,redirect:"error",cache:"no-store",headers:{
    apikey:secret,authorization:"Bearer "+secret,
    accept:"application/json",...(method==="POST"?
     {"content-type":"application/json"}:{})
   },body:method==="POST"?JSON.stringify(payload):undefined,
   signal:AbortSignal.timeout(8000)
  });
 }catch{fail("RESEARCH_SUPABASE_TRANSPORT_UNAVAILABLE")}
 if(!res.ok||res.redirected)fail("RESEARCH_SUPABASE_RPC_OR_READ_FAILED");
 const txt=await res.text();
 if(txt.length>20_000)fail("RESEARCH_SUPABASE_RESPONSE_OVERSIZE");
 try{return JSON.parse(txt)}catch{fail("RESEARCH_SUPABASE_RESPONSE_INVALID")}
}
function utc(t:string,now:number,limit:number){
 if(typeof t!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(t))
  return null;
 const ms=Date.parse(t);
 return Number.isFinite(ms)&&ms<=now+60_000&&now-ms<=limit?ms:null;
}
function numberAt(x:unknown,min=0,max=100):number{
 const n=typeof x==="string"||typeof x==="number"?Number(x):NaN;
 if(!Number.isFinite(n)||n<min||n>max)fail("RESEARCH_SCORE_INVALID");
 return n;
}
function validEvent(e:TrustedResearchEvent,now:number){
 if(!e||!country195ByIso3(e.country_code)||!CAT.has(e.category)||
   !Number.isFinite(e.severity)||e.severity<0||e.severity>100||
   !Number.isFinite(e.confidence)||e.confidence<0||e.confidence>100||
   !SHA.test(e.evidence_sha256)||!Number.isSafeInteger(e.independent_originals)||
   e.independent_originals<1||e.independent_originals>20||
   e.trusted_native_originals_verified!==true||e.research_use_permitted!==true||
   e.commercial_eligible===true)
    fail("RESEARCH_UNTRUSTED_EVENT");
 const timestamp=utc(e.original_published_at,now,MAX_AGE_MS);
 return timestamp;
}
function signingMaterial(env:NodeJS.ProcessEnv=process.env){
 const privateB64=String(env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64??"").trim();
 const id=String(env.RISK_OBJECT_SIGNING_KEY_ID??"").trim();
 const publicB64=String(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"").trim();
 if(!SANITIZED.test(id)||privateB64.length<40||publicB64.length<40)
  fail("RESEARCH_ED25519_SIGNER_NOT_CONFIGURED");
 let key:ReturnType<typeof createPrivateKey>;
 try{key=createPrivateKey({key:Buffer.from(privateB64,"base64"),
  format:"der",type:"pkcs8"})}
 catch{fail("RESEARCH_ED25519_SIGNER_INVALID")}
 if(key.asymmetricKeyType!=="ed25519")fail("RESEARCH_ED25519_KEY_TYPE_INVALID");
 const derived=Buffer.from(createPublicKey(key).export({format:"der",type:"spki"}))
  .toString("base64");
 if(derived!==publicB64)fail("RESEARCH_ED25519_PUBLIC_KEY_MISMATCH");
 return {key,id,publicB64};
}
export function createSignedResearchSnapshot(
 state:Record<string,unknown>,now=new Date(),env:NodeJS.ProcessEnv=process.env
){
 if(!Number.isFinite(now.getTime())||
    !country195ByIso3(String(state.country_code??""))||
    !Number.isSafeInteger(Number(state.version))||Number(state.version)<1||
    !SHA.test(String(state.last_evidence_sha256??""))||
    utc(String(state.last_event_at??""),now.getTime(),MAX_AGE_MS)===null)
  fail("RESEARCH_STATE_TO_SIGN_INVALID");
 const key=signingMaterial(env);
 const generated_at=now.toISOString(),expires_at=
   new Date(now.getTime()+MAX_SIGNED_AGE_MS).toISOString();
 const snap:SignedResearchSnapshot={
  schema:RESEARCH_STATE_SCHEMA,profile:RESEARCH_PROFILE,
  country_code:String(state.country_code),
  version:Number(state.version),
  composite_score:numberAt(state.composite_score),
  geopolitics_score:numberAt(state.geopolitics_score),
  macro_score:numberAt(state.macro_score),
  critical_minerals_score:numberAt(state.critical_minerals_score),
  last_evidence_sha256:String(state.last_evidence_sha256),
  last_event_at:new Date(String(state.last_event_at)).toISOString(),
  updated_at:new Date(String(state.updated_at)).toISOString(),
  generated_at,expires_at,verification_status:"PROVISIONAL_RESEARCH_ONLY",
  commercial_eligible:false,execution_authorized:false,
 };
 const canonical=canonicalResearchJson(snap),hash=researchSha256(canonical);
 const signature=sign(null,Buffer.from(canonical),key.key).toString("base64");
 return {snapshot:snap,canonical,hash,signature,keyId:key.id};
}
export async function ingestDirectlyForRiskGate(
 event:TrustedResearchEvent,opts:{
 env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;now?:Date
 }={}
){
 const now=opts.now??new Date(),ms=now.getTime();
 if(!Number.isFinite(ms))fail("RESEARCH_CLOCK_INVALID");
 const originalAt=validEvent(event,ms);
 if(originalAt===null)return Object.freeze({
  status:"SKIPPED_NONCURRENT_NATIVE_TIMESTAMP",state_changed:false,
  signed:false,execution_authorized:false,commercial_eligible:false});
 if(event.severity<40)return Object.freeze({
  status:"SKIPPED_LOW_SIGNAL",state_changed:false,
  signed:false,execution_authorized:false,commercial_eligible:false});
 const state=await restJson("rpc/update_country_realtime_score","POST",{
  p_country_code:event.country_code,p_severity:event.severity,
  p_confidence:event.confidence,p_category:event.category,
  p_evidence_sha256:event.evidence_sha256,
  p_original_published_at:event.original_published_at,
  p_independent_originals:event.independent_originals
 },opts);
 if(!record(state)||typeof state.status!=="string")
  fail("RESEARCH_STATE_RPC_INVALID");
 if(state.status!=="RESEARCH_STATE_UPDATED")return {
  status:state.status,state_changed:false,signed:false,
  execution_authorized:false,commercial_eligible:false};
 if(state.state_changed!==true||state.profile!==RESEARCH_PROFILE||
   state.country_code!==event.country_code||
   !Number.isSafeInteger(Number(state.version))||Number(state.version)<1)
  fail("RESEARCH_STATE_RECEIPT_UNVERIFIED");
 // No invented signed object for a weak event; a stale signed version is
 // invalidated by atomic SQL until a high-severity event is signed.
 if(event.severity<70)return {
  status:"RESEARCH_STATE_UPDATED_UNSIGNED",
  state_changed:true,version:state.version,signed:false,
  execution_authorized:false,commercial_eligible:false};
 const signed=createSignedResearchSnapshot(state,now,opts.env);
 const accepted=await restJson("rpc/attach_country_research_signature","POST",{
  p_country_code:event.country_code,p_expected_version:state.version,
  p_snapshot:signed.snapshot,p_snapshot_sha256:signed.hash,
  p_signature_b64:signed.signature,p_signing_key_id:signed.keyId
 },opts);
 if(accepted!==true)
  fail("RESEARCH_SIGNATURE_STALE_COMPARE_AND_SWAP");
 return {
  status:"RESEARCH_SIGNED_STATE_UPDATED",state_changed:true,
  version:state.version,signed:true,snapshot_sha256:signed.hash,
  signing_key_id:signed.keyId,
  execution_authorized:false,commercial_eligible:false,
 };
}
export async function getLatestSignedResearchGRO(country_code:string,opts:{
 env?:NodeJS.ProcessEnv;fetchImpl?:typeof fetch;now?:Date
}={}):Promise<(SignedResearchSnapshot&{research_signature_b64:string;research_sha256:string;research_signing_key_id:string})|null>{
 if(!country195ByIso3(country_code))return null;
 const env=opts.env??process.env,publicB64=
  String(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"").trim();
 if(publicB64.length<40)return null;
 let rows:unknown;
 try{
  rows=await restJson("country_risk_state?country_code=eq."+
   encodeURIComponent(country_code)+
   "&select=country_code,version,signed_version,signed_snapshot,signed_snapshot_sha256,signed_signature_b64,signed_signing_key_id&limit=1",
   "GET",undefined,opts);
 }catch{return null}
 if(!Array.isArray(rows)||rows.length!==1||!record(rows[0]))return null;
 const row=rows[0],snap=row.signed_snapshot;
 if(!record(snap)||snap.schema!==RESEARCH_STATE_SCHEMA||
   snap.profile!==RESEARCH_PROFILE||snap.country_code!==country_code||
   snap.commercial_eligible!==false||snap.execution_authorized!==false||
   snap.verification_status!=="PROVISIONAL_RESEARCH_ONLY"||
   !Number.isSafeInteger(Number(row.version))||
   Number(row.version)!==Number(row.signed_version)||
   Number(row.version)!==snap.version||
   !SHA.test(String(row.signed_snapshot_sha256??""))||
   !SANITIZED.test(String(row.signed_signing_key_id??""))||
   row.signed_signing_key_id!==env.RISK_OBJECT_SIGNING_KEY_ID)
   return null;
 const clock=(opts.now??new Date()).getTime();
 if(utc(String(snap.generated_at??""),clock,MAX_SIGNED_AGE_MS)===null||
   !Number.isFinite(Date.parse(String(snap.expires_at??"")))||
   Date.parse(String(snap.expires_at))<=clock||
   !SHA.test(String(snap.last_evidence_sha256??"")))
   return null;
 try{
  const canonical=canonicalResearchJson(snap);
  if(researchSha256(canonical)!==row.signed_snapshot_sha256)return null;
  const publicKey=createPublicKey({key:Buffer.from(publicB64,"base64"),
   format:"der",type:"spki"});
  if(publicKey.asymmetricKeyType!=="ed25519"||
     !verify(null,Buffer.from(canonical),publicKey,
       Buffer.from(String(row.signed_signature_b64??""),"base64")))
     return null;
  return {...snap as SignedResearchSnapshot,
    research_signature_b64:String(row.signed_signature_b64),
    research_sha256:String(row.signed_snapshot_sha256),
    research_signing_key_id:String(row.signed_signing_key_id)};
 }catch{return null}
}
