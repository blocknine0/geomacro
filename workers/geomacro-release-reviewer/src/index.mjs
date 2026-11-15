/**
 * Private service-binding reviewer for commercial-derived Risk Gate grants.
 * It is deliberately fail-closed: no live release flags, current Predge D1
 * entitlement, matching release receipt, current signed GRO, or explicit
 * derived score means no grant. It never reads or returns publisher text.
 */
const CLIENT="predge-paid-risk-gate-addendum-v2";
const DOMAIN="geomacro.commercial-independent-release-review.v1\n";
const HEX=/^[a-f0-9]{64}$/u;
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const text=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=value=>{
 if(typeof value!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/u.test(value))throw Error("KEY_INVALID");
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(b64(bytes)!==value)throw Error("KEY_INVALID");
 return bytes;
};
function canonical(value){
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
}
async function sha(value){
 const bytes=typeof value==="string"?text.encode(value):value;
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
}
async function readJson(request){
 const reader=request.body?.getReader();if(!reader)throw Error("BODY_INVALID");
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>24000){await reader.cancel();throw Error("BODY_TOO_LARGE");}
  chunks.push(value);
 }}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{throw Error("BODY_INVALID");}
}
function response(value,status=200){return Response.json(value,{status,headers:{"Cache-Control":"no-store"}})}
function enabled(env){return env.GEOMACRO_COMMERCIAL_STREAM_RELEASE==="1"&&
 env.RISK_STREAM_CANARY_HOLD_CLEARED==="1"&&
 env.RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED==="1"&&
 env.PREDGE_PAID_CUSTOMER_ENTITLEMENT_VERIFIED==="1"&&
 env.PREDGE_PAID_GO_LIVE_APPROVED==="1"&&
 HEX.test(env.RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256??"")&&
 !!env.DB?.prepare;
}
async function privateKey(env){
 const raw=decode(env.GEOMACRO_RELEASE_REVIEW_PRIVATE_PKCS8_B64);
 if(raw.length!==48)throw Error("KEY_INVALID");
 return crypto.subtle.importKey("pkcs8",raw,{name:"Ed25519"},false,["sign"]);
}
async function publicKey(env){
 const raw=decode(env.GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64);
 if(raw.length!==44)throw Error("KEY_INVALID");
 return crypto.subtle.importKey("spki",raw,{name:"Ed25519"},false,["verify"]);
}
function validScore(score,gro){
 return score&&typeof score==="object"&&!Array.isArray(score)&&
  score.country_iso3===gro.subject?.id&&score.category===gro.category&&
  Number.isFinite(score.value_0_100)&&score.value_0_100>=0&&score.value_0_100<=100&&
  typeof score.provenance==="string"&&score.provenance.length>=8&&
  score.derived_only===true&&score.licensed_source_text_included===false&&
  score.independent_accuracy_certified===false;
}
async function review(body,env,now){
 if(!enabled(env))return {schema:"geomacro.commercial-review-result.v1",grants:[],status:"HOLD_RELEASE_OR_ENTITLEMENT_UNAVAILABLE"};
 if(body?.schema!=="geomacro.commercial-review-request.v1"||
   body.original_content_not_transmitted!==true||body.no_funds!==true||
   body.client_id!==CLIENT||!HEX.test(body.source_gro_id??"")||
   !HEX.test(body.source_gro_sha256??"")||!HEX.test(body.proposed_gro_id??"")||
   !HEX.test(body.proposed_gro_sha256??"")||
   !Array.isArray(body.original_observation_ids)||body.original_observation_ids.length!==2||
   !body.original_observation_ids.every(x=>HEX.test(x))||
   typeof body.source_gro_payload_json!=="string"||body.source_gro_payload_json.length>16000||
   typeof body.source_gro_signature_b64!=="string")
  throw Error("REQUEST_INVALID");
 let gro;try{gro=JSON.parse(body.source_gro_payload_json)}catch{throw Error("GRO_INVALID")}
 if(JSON.stringify(gro)!==body.source_gro_payload_json||
   await sha(body.source_gro_payload_json)!==body.source_gro_sha256||
   body.source_gro_id!==await sha(JSON.stringify(gro.source_originals?.slice().sort()??[]))||
   gro.schema!=="geomacro.event-stream-gro.v1"||
   !/^[A-Z]{3}$/u.test(gro.subject?.id??"")||!CATEGORIES.has(gro.category)||
   gro.subject.id!==body.country_iso3||gro.category!==body.category||
   !HEX.test(gro.event_fingerprint??"")||
   gro.source_originals?.slice().sort().join("|")!==body.original_observation_ids.slice().sort().join("|")||
   gro.execution_authorized!==false||gro.charged!==false||gro.customer_delivery_authorized!==false||
   gro.evidence_and_confidence?.source_rights_and_origins!=="DUAL_MACHINE_ATTESTED"||
   gro.evidence_and_confidence?.raw_sources_not_republished!==true||
   !Number.isFinite(Date.parse(gro.expires_at))||Date.parse(gro.expires_at)<=now)
  throw Error("GRO_CLAIMS_INVALID");
 const groKey=await crypto.subtle.importKey("spki",decode(env.RISK_STREAM_GRO_VERIFY_SPKI_B64),{name:"Ed25519"},false,["verify"]);
 if(!await crypto.subtle.verify("Ed25519",groKey,decode(body.source_gro_signature_b64),text.encode(body.source_gro_payload_json)))
  throw Error("GRO_SIGNATURE_INVALID");
 const rolePairs={GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
  MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
  CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]};
 const evidence=await env.DB.prepare("SELECT e.observation_id,e.original_verified,e.publisher_root_domain,e.parent_media_entity,e.source_role,s.enabled,s.commercial_rights_approved,s.rights_expire_at FROM risk_stream_evidence e JOIN risk_stream_sources s ON s.source_id=e.source_id WHERE e.observation_id IN (SELECT value FROM json_each(?)) AND e.event_fingerprint=? AND e.category=? AND e.country_iso3=? LIMIT 3")
  .bind(JSON.stringify(body.original_observation_ids),gro.event_fingerprint,gro.category,gro.subject.id).all();
 const evidenceRows=evidence?.results??[];
 if(evidenceRows.length!==2||evidenceRows.some(row=>row.original_verified!==1||
   row.enabled!==1||row.commercial_rights_approved!==1||
   !Number.isFinite(Date.parse(row.rights_expire_at))||Date.parse(row.rights_expire_at)<=now)||
   new Set(evidenceRows.map(row=>row.publisher_root_domain)).size!==2||
   new Set(evidenceRows.map(row=>row.parent_media_entity)).size!==2||
   evidenceRows.map(row=>row.source_role).sort().join("|")!==rolePairs[gro.category].slice().sort().join("|"))
  return {schema:"geomacro.commercial-review-result.v1",grants:[],status:"HOLD_CURRENT_INDEPENDENT_SOURCE_RIGHTS_UNVERIFIED"};
 const candidate={...gro,customer_delivery_authorized:true,commercial_origin_gro_id:body.source_gro_id};
 const candidateJson=JSON.stringify(candidate);
 if(await sha(candidateJson)!==body.proposed_gro_sha256||
   body.proposed_gro_id!==await sha("geomacro.authorized-gro.v1\n"+body.source_gro_id))
  throw Error("CANDIDATE_BINDING_INVALID");
 const score=body.eligible_derived_score;
 if(!validScore(score,gro)||canonical(gro.eligible_derived_score)!==canonical(score))
  return {schema:"geomacro.commercial-review-result.v1",grants:[],status:"HOLD_EXPLICIT_DERIVED_SCORE_REQUIRED"};
 const receipt=env.RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256;
 const entitlement=await env.DB.prepare("SELECT client_id,enabled,entitlement_expires_at,release_receipt_sha256 FROM risk_stream_commercial_subscriptions WHERE client_id=? LIMIT 1").bind(CLIENT).first();
 const expires=Date.parse(entitlement?.entitlement_expires_at??"");
 if(!entitlement||entitlement.enabled!==1||entitlement.release_receipt_sha256!==receipt||
   !Number.isFinite(expires)||expires<=now||expires>Date.parse(gro.expires_at))
  return {schema:"geomacro.commercial-review-result.v1",grants:[],status:"HOLD_PREDGE_ENTITLEMENT_UNVERIFIED"};
 const [signer,verifier]=await Promise.all([privateKey(env),publicKey(env)]);
 const challenge=text.encode("geomacro.release-review-keypair.v1\n"+receipt);
 const keyProof=await crypto.subtle.sign("Ed25519",signer,challenge);
 if(!await crypto.subtle.verify("Ed25519",verifier,keyProof,challenge))throw Error("REVIEW_KEYPAIR_MISMATCH");
 const approval={schema:"geomacro.commercial-release-accepted.v1",
  client_id:CLIENT,production_release_verified:true,independent_source_rights_verified:true,
  customer_entitlement_verified:true,go_live_approved:true,canary_hold_cleared:true,
  source_gro_sha256:body.source_gro_sha256,
  validated_gro_sha256:body.proposed_gro_sha256,
  eligible_derived_score_sha256:await sha(canonical(score)),
  signed_release_receipt_sha256:receipt,reviewed_at:new Date(now).toISOString(),
  customer_entitlement_expires_at:entitlement.entitlement_expires_at};
 const approvalPayload=canonical(approval);
 approval.signature_b64=b64(await crypto.subtle.sign("Ed25519",signer,
  text.encode(DOMAIN+approvalPayload)));
 if(!await crypto.subtle.verify("Ed25519",verifier,decode(approval.signature_b64),
   text.encode(DOMAIN+approvalPayload)))throw Error("REVIEW_SIGNATURE_SELF_CHECK_FAILED");
 return {schema:"geomacro.commercial-review-result.v1",grants:[{
  client_id:CLIENT,eligible_derived_score:score,approval}],status:"REVIEW_APPROVED"};
}
export async function fetch(request,env,now=Date.now()){
 if(request.method!=="POST")return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 const url=new URL(request.url);
 if(url.pathname!=="/v1/commercial/review"||url.search)return response({ok:false,error:"NOT_FOUND"},404);
 const length=request.headers.get("content-length");
 if(length!==null&&(!/^\d+$/u.test(length)||Number(length)>24000))return response({ok:false,error:"BODY_TOO_LARGE"},413);
 let body;try{body=await readJson(request)}catch(error){
  const code=String(error?.message??"BODY_INVALID");
  return response({ok:false,error:code==="BODY_TOO_LARGE"?code:"BODY_INVALID"},code==="BODY_TOO_LARGE"?413:400);
 }
 try{return response(await review(body,env,now))}
 catch(error){return response({ok:false,error:String(error?.message??"REVIEW_FAILED")},400)}
}
export default {fetch};
