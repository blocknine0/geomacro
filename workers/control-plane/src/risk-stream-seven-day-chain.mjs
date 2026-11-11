/**
 * Provider-readback, hash-linked chronological derived-risk history.
 * Append-only D1 and private R2, no source prose. Seven consecutive UTC days
 * must actually exist: backdated fabricated snapshots never become Complex.
 */
import {verifyGeoMacroCommercialLicense,canonicalLicensedJson,licensedSha}
 from "./risk-stream-commercial-license.mjs";
const DOMAIN="geomacro.commercial-derived-risk-history.v1\n";
const ZERO="0".repeat(64),HEX=/^[0-9a-f]{64}$/u;
const fail=x=>{throw Error("GEOMACRO_SEVEN_DAY_"+x)};
const iso=n=>new Date(n).toISOString(),today=n=>iso(n).slice(0,10);
const b64=x=>btoa(String.fromCharCode(...x));
const bytes=s=>new TextEncoder().encode(s);
const decode=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
const key=async(raw,format,usage)=>crypto.subtle.importKey(format,decode(raw),
 {name:"Ed25519"},false,[usage]);
const dateBack=(now,d)=>today(now-d*86400000);
async function verifyEntry(row,verifyKey){
 let payload;
 try{payload=JSON.parse(row.payload_json)}catch{fail("D1_PAYLOAD_INVALID")}
 if(payload.schema!=="geomacro.commercial-risk-history-entry.v1"||
   payload.country_iso3!==row.country_iso3||
   payload.category!==row.category||
   payload.previous_entry_sha256!==row.previous_entry_sha256||
   payload.licensed_payload_sha256!==row.licensed_payload_sha256||
   payload.day_utc!==row.day_utc||
   payload.score_0_100!==row.score_0_100||
   payload.observed_at!==row.observed_at||
   await licensedSha(canonicalLicensedJson(payload))!==row.entry_sha256||
   !await crypto.subtle.verify("Ed25519",verifyKey,decode(row.signature_b64),
    bytes(DOMAIN+canonicalLicensedJson(payload))))
  fail("D1_CHAIN_SIGNATURE_INVALID");
 return payload;
}
const guarded=env=>env?.RISK_STREAM_ACTIVE==="1"&&
 env?.STREAM_INGESTION_ENABLED==="true"&&
 env?.GEOMACRO_COMMERCIAL_STREAM_RELEASE==="1"&&
 env?.RISK_STREAM_CANARY_HOLD_CLEARED==="1"&&
 env?.RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED==="1"&&
 typeof env?.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64==="string"&&
 typeof env?.RISK_STREAM_GRO_VERIFY_SPKI_B64==="string"&&
 env?.DB?.prepare&&env?.RISK_STREAM_PRIVATE_R2?.put&&env.RISK_STREAM_PRIVATE_R2.get;
export async function appendGeoMacroSignedRiskHistory(env,{envelope,groId,
 now=Date.now()}={}){
 if(!guarded(env)||!env.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64)
  fail("PROTECTED_HISTORY_BINDINGS_UNAVAILABLE");
 const verified=await verifyGeoMacroCommercialLicense(envelope,{now,
  trustedLicensePublicSpkiB64:env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,
  trustedGroPublicSpkiB64:env.RISK_STREAM_GRO_VERIFY_SPKI_B64});
 const p=envelope.payload;
 if(!HEX.test(groId??"")||p.derived?.risk_score_kind!=="GEOMACRO_DERIVED_NOT_CERTIFIED_GRI"||
   !Number.isFinite(p.derived.risk_score_0_100)||
   verified.payload_sha256!==envelope.license_proof.payload_sha256||
   today(Date.parse(p.timestamp_utc))!==today(now))
  fail("GRO_OR_CLOCK_NOT_CURRENT");
 const db=env.DB,day=today(now),cat=p.category,country=p.subject.id;
 const old=await db.prepare("SELECT entry_sha256,licensed_payload_sha256 "+
  "FROM risk_stream_commercial_risk_chain WHERE gro_id=? AND country_iso3=? "+
  "AND category=? LIMIT 1").bind(groId,country,cat).first();
 if(old){
  if(old.licensed_payload_sha256!==verified.payload_sha256)
   fail("IMMUTABLE_EXISTING_GRO_CHANGED");
  return {status:"HISTORY_IDEMPOTENT",entry_sha256:old.entry_sha256};
 }
 const head=await db.prepare("SELECT entry_sha256,observed_at FROM "+
  "risk_stream_commercial_risk_chain WHERE country_iso3=? AND category=? "+
  "ORDER BY observed_at DESC,entry_sha256 DESC LIMIT 1")
  .bind(country,cat).first();
 if(head&&Date.parse(head.observed_at)>now)
  fail("NON_MONOTONIC_HISTORY_CLOCK");
 const previous=head?.entry_sha256??ZERO;
 const payload={schema:"geomacro.commercial-risk-history-entry.v1",
  country_iso3:country,category:cat,day_utc:day,observed_at:iso(now),
  previous_entry_sha256:previous,
  licensed_payload_sha256:verified.payload_sha256,
  score_0_100:p.derived.risk_score_0_100,
  geo_licensed_source_gro_sha256:p.source_gro_sha256,
  original_publisher_text_stored:false,execution_authorized:false};
 const canonical=canonicalLicensedJson(payload),digest=await licensedSha(canonical);
 const priv=await key(env.GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64,"pkcs8","sign");
 const pub=await key(env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,"spki","verify");
 const signature=new Uint8Array(await crypto.subtle.sign("Ed25519",priv,bytes(DOMAIN+canonical)));
 if(!await crypto.subtle.verify("Ed25519",pub,signature,bytes(DOMAIN+canonical)))
  fail("HISTORY_SIGNER_MISMATCH");
 const signatureB64=b64(signature),obj={
  schema:"geomacro.commercial-risk-history-r2.v1",
  entry_sha256:digest,payload,signature_b64:signatureB64};
 const objectKey="risk-stream/commercial-seven-day/v1/"+country+"/"+cat+
  "/"+day+"/"+digest+".json";
 const body=canonicalLicensedJson(obj);
 const prior=await env.RISK_STREAM_PRIVATE_R2.get(objectKey);
 if(prior){
  if(await prior.text()!==body)fail("IMMUTABLE_PRIVATE_OBJECT_CONFLICT");
 }else{
  await env.RISK_STREAM_PRIVATE_R2.put(objectKey,body);
 }
 const reread=await env.RISK_STREAM_PRIVATE_R2.get(objectKey);
 if(!reread||await reread.text()!==body)fail("PRIVATE_R2_READBACK_INVALID");
 const result=await db.prepare("INSERT OR IGNORE INTO risk_stream_commercial_risk_chain "+
  "(entry_sha256,gro_id,country_iso3,category,day_utc,observed_at,previous_entry_sha256,"+
  "licensed_payload_sha256,score_0_100,payload_json,signature_b64,private_r2_object_key,created_at) "+
  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(digest,groId,country,cat,day,iso(now),
  previous,verified.payload_sha256,payload.score_0_100,canonical,signatureB64,
  objectKey,iso(now)).run();
 if(result?.success!==true)fail("D1_HISTORY_WRITE_FAILED");
 const saved=await db.prepare("SELECT entry_sha256,licensed_payload_sha256,private_r2_object_key "+
  "FROM risk_stream_commercial_risk_chain WHERE gro_id=? AND country_iso3=? "+
  "AND category=? LIMIT 1").bind(groId,country,cat).first();
 if(saved?.entry_sha256!==digest||saved.licensed_payload_sha256!==verified.payload_sha256||
   saved.private_r2_object_key!==objectKey)
  fail("IMMUTABLE_HISTORY_D1_READBACK_MISMATCH");
 return {status:"SIGNED_D1_R2_HASH_CHAIN_ENTRY_VERIFIED",day_utc:day,
  entry_sha256:digest,previous_entry_sha256:previous,
  private_r2_readback_verified:true,commercial_delivery_not_inferred:true};
}
export async function verifyGeoMacroSevenDayHistory(env,{country_iso3,category,
 now=Date.now()}={}){
 if(!guarded(env))return {status:"HOLD_HISTORY_BINDINGS_UNAVAILABLE",verified_days:0};
 if(!/^[A-Z]{3}$/.test(country_iso3??"")||
   !["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(category))
  fail("SUBJECT_INVALID");
 const rows=(await env.DB.prepare("SELECT entry_sha256,country_iso3,category,day_utc,"+
  "observed_at,previous_entry_sha256,licensed_payload_sha256,score_0_100,"+
  "payload_json,signature_b64,private_r2_object_key FROM risk_stream_commercial_risk_chain "+
  "WHERE country_iso3=? AND category=? AND observed_at>=? AND observed_at<=? "+
  "ORDER BY observed_at,entry_sha256 LIMIT 1001")
  .bind(country_iso3,category,iso(now-7*86400000),iso(now)).all())?.results??[];
 if(rows.length>1000)fail("HISTORY_QUERY_LIMIT_HOLD");
 const keyPinned=await key(env.GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,"spki","verify");
 let previous=null;const days=new Map();
 for(const r of rows){
  if(previous!==null&&r.previous_entry_sha256!==previous)
   fail("HISTORY_LINK_BREAK_OR_INTERLEAVED_ENTRY");
  await verifyEntry(r,keyPinned);
  const object=await env.RISK_STREAM_PRIVATE_R2.get(r.private_r2_object_key);
  if(!object)fail("HISTORY_R2_MISSING");
  let r2;try{r2=JSON.parse(await object.text())}catch{fail("HISTORY_R2_JSON_INVALID")}
  if(r2?.entry_sha256!==r.entry_sha256||
    canonicalLicensedJson(r2.payload)!==canonicalLicensedJson(JSON.parse(r.payload_json))||
    r2.signature_b64!==r.signature_b64)
   fail("HISTORY_R2_READBACK_DIVERGED");
  days.set(r.day_utc,{day_utc:r.day_utc,score_0_100:r.score_0_100,
   entry_sha256:r.entry_sha256,
   signed_source_license_sha256:r.licensed_payload_sha256});
  previous=r.entry_sha256;
 }
 const vector=Array.from({length:7},(_,i)=>days.get(dateBack(now,6-i)));
 if(vector.some(x=>!x))return {status:"HOLD_SEVEN_REAL_UTC_DAYS_NOT_PRESENT",
  verified_days:vector.filter(Boolean).length,
  immutable_hash_chain:true,private_r2_readback_verified:true};
 return {status:"PROVIDER_BACKED_SEVEN_DAY_SIGNED_CHAIN_PASS",
  verified_days:7,history:vector,head_sha256:vector.at(-1).entry_sha256,
  immutable_hash_chain:true,private_r2_readback_verified:true,
  complete_utc_days_are_not_fabricated:true,
  customer_delivery_authorized_by_history_alone:false};
}
