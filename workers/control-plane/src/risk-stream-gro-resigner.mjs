import {approvedLegalAnchor,hasIndependentApprovedRolePair}
 from "./risk-stream-approved-role-pairs.mjs";

const HEX=/^[a-f0-9]{64}$/u;
const HOURS72=72*3600000;
const TTL_MS=10800000;
const enc=new TextEncoder();
const fail=code=>{throw Error("RISK_STREAM_GRO_RESIGN_"+code)};
const iso=now=>new Date(now).toISOString();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
const sha=async value=>hex(await crypto.subtle.digest("SHA-256",enc.encode(value)));
const decode=value=>{
 if(typeof value!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/u.test(value))fail("BASE64_INVALID");
 const bytes=Uint8Array.from(atob(value),x=>x.charCodeAt(0));
 if(btoa(String.fromCharCode(...bytes))!==value)fail("BASE64_INVALID");
 return bytes;
};

/** Re-sign an expired internal no-funds GRO only while its original evidence
 * and source rights remain inside the existing 72-hour retention window. */
export async function resignExpiredRiskStreamGro(env,groId,{now=Date.now(),row:knownRow=null}={}){
 if(!env?.DB?.prepare||!env?.DB?.batch||!HEX.test(groId??"")||!Number.isFinite(now))
  fail("INPUT_INVALID");
 const old=knownRow??await env.DB.prepare("SELECT gro_id,country_iso3,category,event_fingerprint,"+
  "payload_json,payload_sha256,signature_b64,expires_at FROM risk_stream_signed_gro "+
  "WHERE gro_id=? LIMIT 1").bind(groId).first();
 if(!old||!HEX.test(old.payload_sha256??"")||await sha(old.payload_json)!==old.payload_sha256)
  fail("OLD_ROW_HASH_INVALID");
 const verifyBytes=decode(env.RISK_STREAM_GRO_VERIFY_SPKI_B64);
 if(verifyBytes.length!==44)fail("VERIFY_KEY_INVALID");
 const verifyKey=await crypto.subtle.importKey("spki",verifyBytes,
  {name:"Ed25519"},false,["verify"]);
 if(!await crypto.subtle.verify("Ed25519",verifyKey,decode(old.signature_b64),enc.encode(old.payload_json)))
  fail("OLD_SIGNATURE_INVALID");
 let payload;try{payload=JSON.parse(old.payload_json)}catch{fail("OLD_JSON_INVALID")}
 if(payload?.subject?.id!==old.country_iso3||payload?.category!==old.category||
    payload?.event_fingerprint!==old.event_fingerprint||
    !Number.isFinite(Date.parse(old.expires_at))||
    !Number.isFinite(Date.parse(payload?.expires_at))||
    payload.expires_at!==old.expires_at)fail("OLD_ROW_SCOPE_INVALID");
 if(Date.parse(old.expires_at)>now||Date.parse(payload?.expires_at)>now)
  return {status:"GRO_STILL_CURRENT",gro_id:old.gro_id,row:old,payload};
 if(payload?.schema!=="geomacro.event-stream-gro.v1"||
    payload.customer_delivery_authorized!==false||payload.charged!==false||
    payload.execution_authorized!==false||payload.certified_risk_index!==false||
    payload.evidence_and_confidence?.corroborated_originals!==2||
    payload.evidence_and_confidence?.independent_parent_entities!==2||
    payload.evidence_and_confidence?.source_rights_and_origins!=="DUAL_MACHINE_ATTESTED"||
    payload.evidence_and_confidence?.raw_source_redacted!==true||
    payload.evidence_and_confidence?.raw_sources_not_republished!==true||
    payload.eligible_derived_score?.raw_source_redacted!==true||
    payload.eligible_derived_score?.licensed_source_text_included!==false||
    payload.eligible_derived_score?.derived_only!==true||
    payload.eligible_derived_score?.independent_accuracy_certified!==false||
    payload.subject?.type!=="COUNTRY"||payload.subject.id!==old.country_iso3||
    payload.category!==old.category||payload.event_fingerprint!==old.event_fingerprint||
    !HEX.test(old.event_fingerprint??"")||!Array.isArray(payload.source_originals)||
    payload.source_originals.length!==2||payload.source_originals.some(x=>!HEX.test(x)))
  fail("INTERNAL_PAYLOAD_POLICY_INVALID");

 const evidence=await env.DB.prepare("SELECT e.observation_id,e.country_iso3,e.category,"+
  "e.event_fingerprint,e.source_id,e.publisher_root_domain,e.parent_media_entity,"+
  "e.source_role,e.original_verified,e.published_at,s.enabled,s.commercial_rights_approved,"+
  "s.rights_expire_at FROM risk_stream_evidence e JOIN risk_stream_sources s "+
  "ON s.source_id=e.source_id WHERE e.observation_id IN (SELECT value FROM json_each(?)) "+
  "AND e.country_iso3=? AND e.category=? AND e.event_fingerprint=? LIMIT 3")
  .bind(JSON.stringify(payload.source_originals),old.country_iso3,old.category,
   old.event_fingerprint).all();
 const rows=evidence?.results;
 if(!Array.isArray(rows)||rows.length!==2||rows.some(row=>
   row.country_iso3!==old.country_iso3||row.category!==old.category||
   row.event_fingerprint!==old.event_fingerprint||
   !Number.isFinite(Date.parse(row.published_at))||Date.parse(row.published_at)>now||
   now-Date.parse(row.published_at)>HOURS72||!approvedLegalAnchor(row,old.category,now))||
   !hasIndependentApprovedRolePair(rows,old.category,now))
  fail("CURRENT_INDEPENDENT_EVIDENCE_OR_RIGHTS_MISSING");

 const active=await env.DB.prepare("SELECT gro_id,country_iso3,category,event_fingerprint,"+
  "payload_json,payload_sha256,signature_b64,expires_at FROM risk_stream_signed_gro "+
  "WHERE country_iso3=? AND category=? "+
  "AND event_fingerprint=? AND expires_at>? ORDER BY expires_at DESC LIMIT 1")
  .bind(old.country_iso3,old.category,old.event_fingerprint,iso(now)).first();
 if(active){
  if(!HEX.test(active.gro_id??"")||!HEX.test(active.payload_sha256??"")||
     await sha(active.payload_json)!==active.payload_sha256)fail("ACTIVE_ROW_INVALID");
  let activePayload;try{activePayload=JSON.parse(active.payload_json)}
  catch{fail("ACTIVE_ROW_INVALID")}
  if(JSON.stringify(activePayload.source_originals)!==JSON.stringify(payload.source_originals)||
     activePayload.subject?.id!==old.country_iso3||activePayload.category!==old.category||
     activePayload.event_fingerprint!==old.event_fingerprint||
     activePayload.customer_delivery_authorized!==false||activePayload.charged!==false||
     activePayload.execution_authorized!==false)fail("ACTIVE_ROW_EVIDENCE_NOT_BOUND");
  return {status:"GRO_ALREADY_RESIGNED",gro_id:active.gro_id,row:active,
   payload:activePayload};
 }

 const generatedAt=iso(now),expiresAt=iso(now+TTL_MS);
 const refreshed={...payload,supersedes_gro_id:groId,
  generated_at:generatedAt,expires_at:expiresAt};
 const canonical=JSON.stringify(refreshed),payloadHash=await sha(canonical);
 const newGroId=await sha("geomacro.risk-stream-resigned-gro.v1\n"+groId+"\n"+payloadHash);
 const signBytes=decode(env.RISK_STREAM_GRO_SIGN_PKCS8_B64);
 if(signBytes.length!==48)fail("SIGN_KEY_INVALID");
 const signingKey=await crypto.subtle.importKey("pkcs8",signBytes,
  {name:"Ed25519"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign("Ed25519",signingKey,enc.encode(canonical)));
 const signatureB64=btoa(String.fromCharCode(...signature));
 const created=await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO risk_stream_signed_gro "+
   "(gro_id,country_iso3,category,event_fingerprint,payload_json,payload_sha256,"+
   "signature_b64,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
   .bind(newGroId,old.country_iso3,old.category,old.event_fingerprint,canonical,
    payloadHash,signatureB64,generatedAt,expiresAt),
  env.DB.prepare("INSERT OR IGNORE INTO risk_stream_delivery_outbox "+
   "(gro_id,state,created_at) VALUES (?,'PENDING',?)").bind(newGroId,generatedAt)
 ]);
 if(!Array.isArray(created)||created.length!==2||created.some(x=>x?.success===false))
  fail("WRITE_UNVERIFIED");
 const saved=await env.DB.prepare("SELECT gro_id,country_iso3,category,event_fingerprint,"+
  "payload_json,payload_sha256,signature_b64,expires_at FROM risk_stream_signed_gro "+
  "WHERE gro_id=? LIMIT 1").bind(newGroId).first();
 if(saved?.gro_id!==newGroId||saved.payload_json!==canonical||
    saved.payload_sha256!==payloadHash||saved.signature_b64!==signatureB64||
    saved.expires_at!==expiresAt||!await crypto.subtle.verify("Ed25519",verifyKey,
     decode(signatureB64),enc.encode(saved.payload_json)))fail("READBACK_UNVERIFIED");
 return {status:"GRO_RESIGNED_WITH_CURRENT_EVIDENCE",gro_id:newGroId,
  row:saved,payload:refreshed};
}
