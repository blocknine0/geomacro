/**
 * Review-backed production commercial issuer. Internal GROs remain unchargeable
 * and customer_delivery_authorized=false. This module creates a distinct
 * customer-authorized GRO ONLY after independent signed review and source rights.
 * Missing signer, reviewer Service Binding, entitlement or 0217 ledger => HOLD.
 */
import {licensedSha,canonicalLicensedJson,issueGeoMacroCommercialLicense}
 from "./risk-stream-commercial-license.mjs";
import {commercialDeliveryIsEnabled,stageLicensedCommercialDelivery}
 from "./risk-stream-commercial-outbox.mjs";

const HEX=/^[a-f0-9]{64}$/u;
const enc=new TextEncoder();
const deny=code=>{throw Error("COMMERCIAL_ISSUER_"+code)};
const iso=now=>new Date(now).toISOString();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>{
 if(typeof value!=="string"||!/^[a-zA-Z0-9+/]+={0,2}$/u.test(value))
  deny("BASE64_INVALID");
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(b64(bytes)!==value)deny("BASE64_NONCANONICAL");
 return bytes;
};
const spki=async value=>{
 const raw=decode(value);
 if(raw.length!==44)deny("PUBLIC_KEY_INVALID");
 return crypto.subtle.importKey("spki",raw,{name:"Ed25519"},false,["verify"]);
};
const signingKey=async value=>crypto.subtle.importKey(
 "pkcs8",decode(value),{name:"Ed25519"},false,["sign"]);
const categoryRoles=Object.freeze({
 GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]
});
export function commercialIssuerEnabled(env){
 return commercialDeliveryIsEnabled(env)&&
  typeof env.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64==="string"&&
  typeof env.GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64==="string"&&
  typeof env.RISK_STREAM_GRO_SIGN_PKCS8_B64==="string"&&
  typeof env.GEOMACRO_RELEASE_REVIEWER?.fetch==="function";
}
export async function enqueueCommercialIssuerCandidate(env,groId,{now=Date.now()}={}){
 if(env?.GEOMACRO_COMMERCIAL_STREAM_RELEASE!=="1"||
    env?.RISK_STREAM_CANARY_HOLD_CLEARED!=="1"||!env?.DB?.prepare)
  return {status:"HOLD_RELEASE_UNAVAILABLE"};
 // Persist due work even while the independent reviewer is temporarily down.
 // Cron cannot issue or dispatch without its pinned reviewer and real proofs.
 if(!HEX.test(groId??""))deny("SOURCE_GRO_ID_INVALID");
 const result=await env.DB.prepare(
  "INSERT OR IGNORE INTO risk_stream_commercial_issuer_jobs "+
  "(source_gro_id,state,attempts,next_attempt_at,created_at) "+
  "VALUES (?,'PENDING',0,?,?)"
 ).bind(groId,iso(now),iso(now)).run();
 if(result?.success!==true)deny("WORKLIST_INSERT_FAILED");
 const row=await env.DB.prepare(
  "SELECT source_gro_id,state FROM risk_stream_commercial_issuer_jobs "+
  "WHERE source_gro_id=? LIMIT 1").bind(groId).first();
 if(row?.source_gro_id!==groId)deny("WORKLIST_READBACK_FAILED");
 return {status:"REVIEW_WORKLIST_DURABLE",source_gro_id:groId,paid:false};
}
async function verifyInternalGro(db,groId,env,now){
 const row=await db.prepare(
  "SELECT gro_id,country_iso3,category,event_fingerprint,payload_json,"+
  "payload_sha256,signature_b64,expires_at FROM risk_stream_signed_gro "+
  "WHERE gro_id=? LIMIT 1").bind(groId).first();
 if(!row||!HEX.test(row.payload_sha256??"")||
   await licensedSha(row.payload_json)!==row.payload_sha256)
  deny("INTERNAL_GRO_HASH_OR_ROW_INVALID");
 const key=await spki(env.RISK_STREAM_GRO_VERIFY_SPKI_B64);
 if(!await crypto.subtle.verify("Ed25519",key,decode(row.signature_b64),
    enc.encode(row.payload_json)))deny("INTERNAL_GRO_SIGNATURE_INVALID");
 let p;
 try{p=JSON.parse(row.payload_json)}catch{deny("INTERNAL_GRO_JSON_INVALID")}
 if(p.customer_delivery_authorized!==false||p.charged!==false||
    p.execution_authorized!==false||p.certified_risk_index!==false||
    p.evidence_and_confidence?.source_rights_and_origins!=="DUAL_MACHINE_ATTESTED"||
    p.evidence_and_confidence?.raw_sources_not_republished!==true||
    p.subject?.type!=="COUNTRY"||p.subject?.id!==row.country_iso3||
    p.category!==row.category||p.event_fingerprint!==row.event_fingerprint||
    !categoryRoles[p.category]||
    !Array.isArray(p.source_originals)||p.source_originals.length!==2||
    new Set(p.source_originals).size!==2||
    !p.source_originals.every(x=>HEX.test(x))||
    Date.parse(row.expires_at)<=now||Date.parse(p.expires_at)<=now)
  deny("INTERNAL_GRO_NOT_ELIGIBLE");
 const evidence=await db.prepare(
  "SELECT e.observation_id,e.original_verified,e.publisher_root_domain,"+
  "e.parent_media_entity,e.source_role,s.enabled,s.commercial_rights_approved,"+
  "s.rights_expire_at FROM risk_stream_evidence e "+
  "JOIN risk_stream_sources s ON s.source_id=e.source_id "+
  "WHERE e.observation_id IN (SELECT value FROM json_each(?)) "+
  "AND e.event_fingerprint=? AND e.category=? AND e.country_iso3=? LIMIT 3")
  .bind(JSON.stringify(p.source_originals),p.event_fingerprint,
   p.category,p.subject.id).all();
 const rows=evidence?.results??[];
 if(rows.length!==2||rows.some(e=>e.original_verified!==1||
    e.enabled!==1||e.commercial_rights_approved!==1||
    !Number.isFinite(Date.parse(e.rights_expire_at))||
    Date.parse(e.rights_expire_at)<=now)||
    new Set(rows.map(e=>e.publisher_root_domain)).size!==2||
    new Set(rows.map(e=>e.parent_media_entity)).size!==2||
    rows.map(e=>e.source_role).sort().join("|")!==
      [...categoryRoles[p.category]].sort().join("|"))
  deny("INDEPENDENT_ORIGINAL_RIGHTS_NOT_CURRENT");
 return {row,p};
}
export async function issueReviewedCommercialCandidate(env,sourceGroId,{
 now=Date.now(),requestReview
}={}){
 if(!commercialIssuerEnabled(env))deny("PROTECTED_RELEASE_OR_REVIEWER_MISSING");
 const {row,p}=await verifyInternalGro(env.DB,sourceGroId,env,now);
 // The authorized candidate is a separate immutable signed GRO. The original
 // no-funds GRO is never overwritten or silently upgraded.
 const candidatePayload={...p,customer_delivery_authorized:true,
  commercial_origin_gro_id:sourceGroId};
 const candidateJson=JSON.stringify(candidatePayload);
 const candidateHash=await licensedSha(candidateJson);
 const authorizedGroId=await licensedSha("geomacro.authorized-gro.v1\n"+sourceGroId);
 const input={schema:"geomacro.commercial-review-request.v1",
  source_gro_id:sourceGroId,source_gro_sha256:row.payload_sha256,
  proposed_gro_id:authorizedGroId,proposed_gro_sha256:candidateHash,
  country_iso3:p.subject.id,category:p.category,
  original_observation_ids:p.source_originals,
  original_content_not_transmitted:true,no_funds:true};
 const reviewer=requestReview??(async body=>{
  const response=await env.GEOMACRO_RELEASE_REVIEWER.fetch(
   "https://reviewer.internal/v1/commercial/review",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(12000)});
  if(response.status!==200||response.redirected)deny("REVIEWER_HTTP_UNAVAILABLE");
  return response.json();
 });
 const response=await reviewer(input);
 if(response?.schema!=="geomacro.commercial-review-result.v1"||
    !Array.isArray(response.grants)||response.grants.length<1||
    response.grants.length>10)deny("REVIEWER_RESPONSE_INVALID");
 const clientIds=new Set(),envelopes=[];
 for(const g of response.grants){
  if(typeof g?.client_id!=="string"||clientIds.has(g.client_id))
   deny("REVIEW_DUPLICATE_CLIENT");
  clientIds.add(g.client_id);
  const approval=g.approval,score=g.eligible_derived_score;
  if(!approval||approval.source_gro_sha256!==row.payload_sha256||
     approval.client_id!==g.client_id||
     approval.eligible_derived_score_sha256!==
       await licensedSha(canonicalLicensedJson(score))||
     approval.validated_gro_sha256!==candidateHash)
   deny("REVIEW_NOT_BOUND_TO_SOURCE_CLIENT_SCORE");
  // This validates independent reviewer Ed25519 approval, signed candidate
  // hash, entitlements, score, rights and expiry BEFORE any database mutation.
  const key=await signingKey(env.RISK_STREAM_GRO_SIGN_PKCS8_B64);
  const signature=b64(new Uint8Array(await crypto.subtle.sign(
   "Ed25519",key,enc.encode(candidateJson))));
  const license=await issueGeoMacroCommercialLicense({
   record:{gro_id:authorizedGroId,payload_json:candidateJson,
     payload_sha256:candidateHash,signature_b64:signature},
   groPublicSpkiB64:env.RISK_STREAM_GRO_VERIFY_SPKI_B64,
   licensePrivatePkcs8B64:env.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64,
   licensePublicSpkiB64:env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,
   releasePublicSpkiB64:env.GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64,
   eligibleDerivedScore:score,approval,now
  });
  envelopes.push({client_id:g.client_id,license,signature});
 }
 const signature=envelopes[0].signature;
 const inserted=await env.DB.prepare(
  "INSERT OR IGNORE INTO risk_stream_signed_gro "+
  "(gro_id,country_iso3,category,event_fingerprint,payload_json,"+
  "payload_sha256,signature_b64,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .bind(authorizedGroId,p.subject.id,p.category,p.event_fingerprint,
   candidateJson,candidateHash,signature,p.generated_at,p.expires_at).run();
 if(inserted?.success!==true)deny("REVIEWED_GRO_INSERT_FAILED");
 const saved=await env.DB.prepare(
  "SELECT payload_sha256,signature_b64,payload_json FROM risk_stream_signed_gro "+
  "WHERE gro_id=? LIMIT 1").bind(authorizedGroId).first();
 if(saved?.payload_sha256!==candidateHash||
    saved.signature_b64!==signature||saved.payload_json!==candidateJson)
  deny("REVIEWED_GRO_IMMUTABILITY_READBACK_FAILED");
 let staged=0;
 for(const g of envelopes){
  const result=await stageLicensedCommercialDelivery(env,{
   client:{client_id:g.client_id},groId:authorizedGroId,
   envelope:g.license,now});
  if(!["COMMERCIAL_JOB_STAGED","COMMERCIAL_JOB_IDEMPOTENT"].includes(result.status))
   deny("COMMERCIAL_OUTBOX_READBACK_NOT_VERIFIED");
  staged++;
 }
 return {status:"SIGNED_LICENSED_JOBS_DURABLE",source_gro_id:sourceGroId,
  authorized_gro_id:authorizedGroId,licensed_clients:staged,paid:false};
}
export async function runCommercialIssuerTick(env,{now=Date.now(),max=5,
 requestReview}={}){
 if(!commercialIssuerEnabled(env))
  return {status:"HOLD_COMMERCIAL_ISSUER_NOT_ENABLED",issued:0};
 if(!Number.isInteger(max)||max<1||max>10)deny("INVALID_BATCH_LIMIT");
 const nowIso=iso(now);
 const due=await env.DB.prepare(
  "SELECT source_gro_id,attempts FROM risk_stream_commercial_issuer_jobs "+
  "WHERE ((state='PENDING' AND next_attempt_at<=?) OR "+
  "(state='LEASED' AND lease_expires_at<=?)) AND attempts<16 "+
  "ORDER BY created_at,source_gro_id LIMIT ?")
  .bind(nowIso,nowIso,max).all();
 if(!Array.isArray(due?.results)||due.results.length>max)deny("DUE_CENSUS_INVALID");
 let issued=0,held=0;
 for(const row of due.results){
  const lease=iso(now+45000);
  const claimed=await env.DB.prepare(
   "UPDATE risk_stream_commercial_issuer_jobs "+
   "SET state='LEASED',lease_expires_at=?,attempts=attempts+1 "+
   "WHERE source_gro_id=? AND attempts<16 AND "+
   "((state='PENDING' AND next_attempt_at<=?) OR "+
   "(state='LEASED' AND lease_expires_at<=?))")
   .bind(lease,row.source_gro_id,nowIso,nowIso).run();
  if(claimed?.success!==true)deny("LEASE_WRITE_FAILED");
  if(claimed.meta?.changes!==1)continue;
  try{
   const result=await issueReviewedCommercialCandidate(env,row.source_gro_id,{
    now,requestReview});
   const saved=await env.DB.prepare(
    "UPDATE risk_stream_commercial_issuer_jobs "+
    "SET state='ISSUED',reviewed_gro_id=?,completed_at=?,lease_expires_at=NULL "+
    "WHERE source_gro_id=? AND state='LEASED' AND lease_expires_at=?")
    .bind(result.authorized_gro_id,nowIso,row.source_gro_id,lease).run();
   if(saved?.success!==true||saved.meta?.changes!==1)deny("ISSUED_LEDGER_INVALID");
   issued++;
  }catch(error){
   held++;
   const msg=String(error?.message??"UNKNOWN");
   const code=/^[A-Z0-9_]{4,120}$/.test(msg)?msg:"REVIEW_ISSUER_HELD";
   const attempts=row.attempts+1;
   const state=attempts>=16?"HOLD":"PENDING";
   const next=iso(now+Math.min(3600000,15000*2**Math.min(7,attempts)));
   await env.DB.prepare(
    "UPDATE risk_stream_commercial_issuer_jobs SET state=?,next_attempt_at=?,"+
    "lease_expires_at=NULL,last_error_code=? "+
    "WHERE source_gro_id=? AND state='LEASED' AND lease_expires_at=?")
    .bind(state,next,code,row.source_gro_id,lease).run();
  }
 }
 return {status:held?"REVIEW_RETRY_OR_HOLD":"ISSUER_TICK_OK",
  attempted:due.results.length,issued,held,paid:false};
}
