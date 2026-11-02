// Worker-compatible verified GRO trust boundary; no unverified evidence may cross.
import {canonical,sha256,decodeBase64} from "./crypto.mjs";

const PINNED = Object.freeze({
 "geomacro-risk-2026-02":{spki:"MCowBQYDK2VwAyEASbcPf48wkPOngubSwToXXZd2rCzRoC9n/tnpuyj25dw=",fingerprint:"526a7956d2a9ccd10b94d05fd4bc19e4464f1e431734bc60ab5b0d9c9b1ad6ec",status:"retired"},
 "geomacro-risk-2026-03":{spki:"MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=",fingerprint:"432f35218570c80c09d56a8005390f6d3111a932ba93298f4ffd86d9896c0b90",status:"active"}
});
const TRUST_URL="https://geomacro.live/api/risk-object-keys";
const textBytes=v=>new TextEncoder().encode(v);
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function digest(bytes){return hex(await crypto.subtle.digest("SHA-256",bytes));}
export async function loadPinnedKeys(fetchImpl=fetch){
  const response=await fetchImpl(TRUST_URL,{headers:{accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error("TRUST_REGISTRY_HTTP");
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>32768)throw Error("TRUST_REGISTRY_TOO_LARGE");
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  if(payload?.ok!==true||!Array.isArray(payload.keys)||payload.keys.length!==Object.keys(PINNED).length)
    throw Error("TRUST_REGISTRY_INVALID");
  const validated=Object.create(null);
  for(const key of payload.keys){
    const expected=PINNED[key?.key_id];
    if(!expected||validated[key.key_id]||key.public_key_spki_b64!==expected.spki||key.status!==expected.status||
       key.not_before!=null||key.not_after!=null)throw Error("TRUST_REGISTRY_PIN_MISMATCH");
    const bytes=decodeBase64(key.public_key_spki_b64);
    if(await digest(bytes)!==expected.fingerprint)throw Error("TRUST_REGISTRY_FINGERPRINT_MISMATCH");
    validated[key.key_id]={...expected};
  }
  return validated;
}
export async function verifySignedGro(object,{iso3,now=new Date(),keys}={}){
  const fail=(code)=>({valid:false,code});
  if(!object||object.schema_version!=="gro-1.1"||object.issuer!=="Geomacro"||
     object.subject?.type!=="country"||object.subject?.id!==iso3 ||
     object.verification?.status!=="VERIFIED"||object.commercial_eligibility?.status!=="VERIFIED")
    return fail("GRO_CONTRACT_UNQUALIFIED");
  const generated=Date.parse(object.generated_at),expires=Date.parse(object.expires_at);
  if(!Number.isFinite(generated)||!Number.isFinite(expires)||generated>now.getTime()||expires<=now.getTime()||expires<=generated)
    return fail("GRO_NOT_CURRENT");
  const i=object.integrity;
  if(i?.canonicalization!=="geomacro-canonical-json-v1"||i.signature_scheme!=="Ed25519"||
     !/^[a-f0-9]{64}$/.test(i.payload_hash||"")||typeof i.signature!=="string"||!keys?.[i.signing_key_id]||
     !Array.isArray(object.attribution)||!Array.isArray(object.evidence))
    return fail("GRO_SIGNATURE_METADATA_INVALID");
  const entry=keys[i.signing_key_id];
  if(entry.status!=="active"&&entry.status!=="retired")return fail("GRO_SIGNER_REVOKED");
  try{
    const signed={...object,integrity:{...i,payload_hash:null,signature:null}};
    const raw=canonical(signed);
    if(await sha256(raw)!==i.payload_hash)return fail("GRO_HASH_MISMATCH");
    const pub=await crypto.subtle.importKey("spki",decodeBase64(entry.spki),{name:"Ed25519"},false,["verify"]);
    if(!await crypto.subtle.verify("Ed25519",pub,decodeBase64(i.signature),textBytes(raw)))
      return fail("GRO_SIGNATURE_INVALID");
    if(!Number.isFinite(object.risk?.score)||object.risk.score<0||object.risk.score>100||
       !Number.isFinite(object.confidence)||object.confidence<0||object.confidence>1||
       !Number.isInteger(object.evidence_summary?.independent_source_count)||
       object.evidence_summary.independent_source_count<1)
      return fail("GRO_EVIDENCE_INVALID");
    return {valid:true,payload_sha256:i.payload_hash};
  }catch{return fail("GRO_SIGNATURE_ERROR");}
}
const DRIVER_DOMAINS=Object.freeze({
 conflict:"geopolitics",sanctions:"geopolitics",political_instability:"geopolitics",
 trade_policy:"geopolitics",shipping_logistics:"geopolitics",
 monetary_policy:"macro_fx",inflation:"macro_fx",labor_market:"macro_fx",
 currency_fx:"macro_fx",macro_stress:"macro_fx",
 rare_earth_supply:"critical_minerals",critical_minerals:"critical_minerals"
});
/** A signed GRO driver contribution is NOT a new news event or corridor route score. */
export async function deriveSignalsFromSignedGro(gro,iso3,verified,now=new Date()){
  if(!verified?.valid||verified.payload_sha256!==gro.integrity?.payload_hash)throw Error("SIGNED_GRO_REQUIRED");
  const result=[];
  const seen=new Set();
  for(const a of gro.attribution){
    const domain=DRIVER_DOMAINS[a.driver];
    if(!domain||seen.has(a.driver)||!Number.isInteger(a.event_count)||a.event_count<=0||
      !Number.isFinite(a.score_contribution)||a.score_contribution<=0||a.score_contribution>100)continue;
    seen.add(a.driver);
    const fingerprint=await sha256({object_id:gro.object_id,driver:a.driver,domain});
    result.push({
      event_sha256:fingerprint,verified_gro_sha256:verified.payload_sha256,
      country_iso3:iso3,domain,signal_kind:"gro_driver_"+a.driver,
      intensity:a.score_contribution,verification_status:"VERIFIED",
      original_at:gro.generated_at
    });
  }
  return result;
}
