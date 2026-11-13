import {createHash,createPublicKey,verify} from "node:crypto";
import {fetchWithoutRedirect} from "./fetch-without-redirect";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import type {PublicRiskIndices} from "./risk-indices.types";

const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev";
const ALLOWED=new Map([["geopolitics","geopolitics"],["macro","macro"],["critical_minerals","rare_earth"]]);
export async function readGeoMacroNewsSeverityRiskIndices(fetchImpl=fetchWithoutRedirect,now=Date.now()):Promise<PublicRiskIndices|null>{
 try{
  const [response,keyResponse]=await Promise.all([
   fetchImpl(ROOT+"/v1/public/geomacro-news-severity-risk-indices",{
    method:"GET",redirect:"manual",headers:{Accept:"application/json"},signal:AbortSignal.timeout(4500)}),
   fetchImpl(ROOT+"/v1/public/risk-gate-decision-key",{
    method:"GET",redirect:"manual",headers:{Accept:"application/json"},signal:AbortSignal.timeout(2500)})
  ]);
  if(response.status!==200||keyResponse.status!==200||response.redirected||keyResponse.redirected||
    response.headers.get("x-geomacro-signature-scheme")!=="Ed25519")return null;
  const [doc,keyInfo]=await Promise.all([response.json(),keyResponse.json()]) as any[];
  const delivery=doc?.ed25519_delivery,report={...doc};delete report.ed25519_delivery;
  const data=doc?.data as PublicRiskIndices;
  if(doc?.schema!=="geomacro.self-certified-news-severity-gri.v1"||
    doc?.scope!=="GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY"||
    doc?.independent_third_party_certified!==false||
    delivery?.schema!=="geomacro.news-severity-ed25519-delivery.v1"||
    delivery?.proof_scope!=="GEOMACRO_SELF_CERTIFIED_NEWS_SEVERITY_CALCULATION_ONLY"||
    delivery?.independent_third_party_certified!==false||
    delivery?.source_event_facts_independently_verified!==false||
    keyInfo?.ok!==true||keyInfo.scheme!=="Ed25519"||keyInfo.key_id!==delivery.signature_key_id||
    response.headers.get("x-geomacro-signing-key-id")!==delivery.signature_key_id||
    response.headers.get("x-geomacro-signature")!==delivery.signature_b64||
    response.headers.get("x-geomacro-payload-sha256")!==delivery.payload_sha256||
    keyInfo.public_key_spki_b64!==String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??keyInfo.public_key_spki_b64)||
    !/^[A-Za-z0-9+/]{55,120}={0,2}$/u.test(keyInfo.public_key_spki_b64??"")||
    !/^[A-Za-z0-9+/]{86}==$/.test(delivery.signature_b64??"")||
    !/^[a-f0-9]{64}$/.test(delivery.payload_sha256??"")||
    data?.proofScope!=="geomacro-news-severity"||
    data.parentMethodologyVersion!=="geomacro-news-severity-v1.1.0"||
    data.verificationStatus!=="verified"||!Array.isArray(data.indices)||data.indices.length!==3)
    return null;
  const payloadBytes=Buffer.from(canonicalRiskObjectJson(report));
  if(createHash("sha256").update(payloadBytes).digest("hex")!==delivery.payload_sha256)return null;
  const key=createPublicKey({key:Buffer.from(keyInfo.public_key_spki_b64,"base64"),format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519"||!verify(null,payloadBytes,key,Buffer.from(delivery.signature_b64,"base64")))return null;
  const stamp=Date.parse(String(data.snapshotAsOf));
  if(!Number.isFinite(stamp)||stamp>now+60_000||now-stamp>6*60_000)return null;
  const remaining=new Map(ALLOWED);
  for(const index of data.indices){
   if(!remaining.has(index.key)||remaining.get(index.key)!==index.sourceCategory||
    !["available","unavailable"].includes(index.status)||
    index.status==="available"&&(!Number.isFinite(index.score)||index.score!<0||index.score!>100)||
    index.sourceMix?.osint_event_facts_verified!==false||
    !index.observedSeverity?.["72H"])
    return null;
   remaining.delete(index.key);
  }
  return remaining.size===0?data:null;
 }catch{return null}
}
