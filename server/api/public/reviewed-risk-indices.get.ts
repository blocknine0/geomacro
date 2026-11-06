import {createHash,createPublicKey,verify as edVerify} from "node:crypto";
import {defineEventHandler,setResponseHeaders,setResponseStatus,type H3Event} from "h3";
import {fetchWithoutRedirect} from "../../../src/lib/fetch-without-redirect";
import {canonicalRiskObjectJson} from "../../../src/lib/risk-object-signing.server";
import type {PublicRiskIndices} from "../../../src/lib/risk-indices.types";

/** Same-origin verified bridge; never echoes an unsigned numeric package. */
const WORKER="https://geomacro-control-plane.daspallab202391.workers.dev";
const fail=(event:H3Event)=>{
  setResponseStatus(event,503);
  return {ok:false,code:"CURRENT_REVIEWED_SIGNED_THREE_INDICES_UNAVAILABLE",
    message:"Awaiting current genuine reviewed GRI input and three signed readings."};
};
export default defineEventHandler(async event=>{
 setResponseHeaders(event,{"Cache-Control":"public, max-age=20",
  "Content-Type":"application/json; charset=utf-8","X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex,nofollow"});
 try{
  const [response,keyResponse]=await Promise.all([
   fetchWithoutRedirect(WORKER+"/v1/public/reviewed-risk-indices",{
    method:"GET",redirect:"manual",headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(4500)}),
   fetchWithoutRedirect(WORKER+"/v1/public/risk-gate-decision-key",{
    method:"GET",redirect:"manual",headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(2500)})
  ]);
  if(response.status!==200||keyResponse.status!==200||
     response.redirected||keyResponse.redirected)return fail(event);
  const raw=await response.text(),keyRaw=await keyResponse.text();
  if(raw.length>256*1024||keyRaw.length>2048)return fail(event);
  const doc=JSON.parse(raw) as Record<string,unknown>;
  const info=JSON.parse(keyRaw) as Record<string,unknown>;
  const payload=doc.signed_payload as Record<string,unknown>|null;
  if(doc.ok!==true||doc.schema!=="geomacro.reviewed-indices-signed-delivery.v1"||
    doc.signature_scheme!=="Ed25519"||
    payload?.schema!=="geomacro.reviewed-indices-issuer-delivery.v1"||
    payload.signature_proves!=="ISSUER_DELIVERY_INTEGRITY_NOT_REVIEWER_IDENTITY"||
    payload.reviewer_source!=="EXISTING_PROTECTED_GRI_V1_2_PUBLISHER"||
    info.ok!==true||info.scheme!=="Ed25519"||
    doc.signature_key_id!==info.key_id||
    response.headers.get("x-geomacro-signature-scheme")!=="Ed25519"||
    response.headers.get("x-geomacro-signature")!==doc.signature_b64||
    response.headers.get("x-geomacro-signing-key-id")!==doc.signature_key_id||
    response.headers.get("x-geomacro-payload-sha256")!==doc.payload_sha256||
    response.headers.get("x-geomacro-source-as-of")!==payload.source_as_of||
    typeof doc.signature_b64!=="string"||
    !/^[A-Za-z0-9+/]{86}==$/.test(doc.signature_b64)||
    typeof doc.payload_sha256!=="string"||
    !/^[a-f0-9]{64}$/.test(doc.payload_sha256)||
    typeof info.public_key_spki_b64!=="string")
    return fail(event);
  const pin=String(process.env.GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64??"");
  if(pin&&pin!==info.public_key_spki_b64)return fail(event);
  const key=createPublicKey({key:Buffer.from(info.public_key_spki_b64,"base64"),
    format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")return fail(event);
  const bytes=Buffer.from(canonicalRiskObjectJson(payload));
  const digest=createHash("sha256").update(bytes).digest("hex");
  if(digest!==doc.payload_sha256||
     !edVerify(null,bytes,key,Buffer.from(doc.signature_b64,"base64")))
    return fail(event);
  const data=payload.data as PublicRiskIndices;
  if(data?.proofScope!=="verified-category-projection"||
    data.parentMethodologyVersion!=="gri-v1.2.0"||
    data.verificationStatus!=="verified"||
    !Array.isArray(data.indices)||data.indices.length!==3||
    data.indices.some(x=>x.status!=="available"||typeof x.score!=="number"||
      !Number.isFinite(x.score)||x.score<0||x.score>100))
    return fail(event);
  const clock=Date.parse(payload.source_as_of as string);
  const expiry=Date.parse(payload.expires_at as string);
  if(!Number.isFinite(clock)||Date.now()-clock>60*60000||
    clock>Date.now()+5*60000||!Number.isFinite(expiry)||expiry<=Date.now())
    return fail(event);
  return {ok:true,data,meta:{authority:"geomacro-reviewed-gri-ed25519-delivery",
    signature_verified:true,signature_scheme:"Ed25519",
    public_key_trust:pin?"separately_pinned":"cloudflare_origin_tls",
    source_as_of:payload.source_as_of,
    payload_sha256:doc.payload_sha256}};
 }catch{return fail(event)}
});
