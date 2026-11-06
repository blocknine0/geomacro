/** Current, reviewer-gated, Ed25519-verified GRI v1.2 for Ask GeoMacro.
 * This is a read-only projection; never changes Groq generation/cache.
 */
import {createHash,createPublicKey,verify as edVerify} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {fetchWithoutRedirect} from "./fetch-without-redirect";
import type {PublicRiskIndex,PublicRiskIndices} from "./risk-indices.types";
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const allowed=new Map([["geopolitics","geopolitics"],["macro","macro"],["critical_minerals","rare_earth"]]);
export async function readCurrentReviewedSignedIndices(fetchImpl=fetchWithoutRedirect,now=Date.now()):
 Promise<PublicRiskIndices|null>{
 try{
  const opts={method:"GET" as const,redirect:"manual" as const,
    headers:{"Accept":"application/json"},signal:AbortSignal.timeout(2600)};
  const [r,k]=await Promise.all([
   fetchImpl(ROOT+"/v1/public/reviewed-risk-indices",opts),
   fetchImpl(ROOT+"/v1/public/risk-gate-decision-key",opts)]);
  if(r.status!==200||k.status!==200||r.redirected||k.redirected)return null;
  const [raw,rawKey]=await Promise.all([r.text(),k.text()]);
  if(raw.length>256000||rawKey.length>2048)return null;
  const doc=JSON.parse(raw),keyInfo=JSON.parse(rawKey);
  if(doc?.ok!==true||doc.schema!=="geomacro.reviewed-indices-signed-delivery.v1"||
     doc.signature_scheme!=="Ed25519"||keyInfo?.ok!==true||
     keyInfo.scheme!=="Ed25519"||keyInfo.key_id!==doc.signature_key_id||
     typeof doc.signature_b64!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(doc.signature_b64)||
     r.headers.get("x-geomacro-signature")!==doc.signature_b64||
     r.headers.get("x-geomacro-payload-sha256")!==doc.payload_sha256||
     r.headers.get("x-geomacro-signature-scheme")!=="Ed25519"||
     r.headers.get("x-geomacro-signing-key-id")!==keyInfo.key_id)
    return null;
  const p=doc.signed_payload, data=p?.data as PublicRiskIndices;
  if(p?.schema!=="geomacro.reviewed-indices-issuer-delivery.v1"||
     p.signature_proves!=="ISSUER_DELIVERY_INTEGRITY_NOT_REVIEWER_IDENTITY"||
     p.reviewer_source!=="EXISTING_PROTECTED_GRI_V1_2_PUBLISHER"||
     typeof keyInfo.public_key_spki_b64!=="string"||
     !/^[a-f0-9]{64}$/.test(doc.payload_sha256)||
     !Array.isArray(data?.indices)||data.indices.length!==3||
     data.contractVersion!=="risk-indices-v1.1.0"||
     data.proofScope!=="verified-category-projection"||
     data.parentMethodologyVersion!=="gri-v1.2.0"||
     data.verificationStatus!=="verified")return null;
  const pin=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
  if(pin&&pin!==keyInfo.public_key_spki_b64)return null;
  const key=createPublicKey({key:Buffer.from(keyInfo.public_key_spki_b64,"base64"),format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")return null;
  const canonical=Buffer.from(canonicalRiskObjectJson(p));
  if(createHash("sha256").update(canonical).digest("hex")!==doc.payload_sha256||
     !edVerify(null,canonical,key,Buffer.from(doc.signature_b64,"base64")))return null;
  const clock=Date.parse(String(data.snapshotAsOf)),expiry=Date.parse(String(p.expires_at));
  if(!Number.isFinite(clock)||now-clock>60*60000||clock>now+5*60000||
     !Number.isFinite(expiry)||expiry<=now||p.source_as_of!==data.snapshotAsOf)return null;
  const remaining=new Map(allowed);
  for(const index of data.indices){
   const native=Date.parse(String(index.readingAsOf??""));
   if(!remaining.has(index.key)||remaining.get(index.key)!==index.sourceCategory||
      index.status!=="available"||index.readingStatus!=="current"||
      !Number.isFinite(native)||now-native>60*60000||native>now+5*60000||
      typeof index.score!=="number"||!Number.isFinite(index.score)||
      index.score<0||index.score>100)return null;
   remaining.delete(index.key);
  }
  return remaining.size===0?data:null;
 }catch{return null;}
}
export function signedCategoryReading(data:PublicRiskIndices,key:PublicRiskIndex["key"]):PublicRiskIndex|null{
 const item=data.indices.find(row=>row.key===key);
 return item?.status==="available"&&typeof item.score==="number"?item:null;
}
