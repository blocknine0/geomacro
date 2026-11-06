/**
 * Ed25519 fast-tick signature on a derived observation/decision receipt only.
 * Proves GeoMacro response bytes and time, not publisher truth or rights.
 * A missing dedicated private key is reported; never fabricated.
 */
const enc=new TextEncoder();
const SHA=/^[a-f0-9]{64}$/u;
const alphabet=/^[A-Za-z0-9_-]{8,96}$/u;
const canon=x=>{
 if(x===null||typeof x==="string"||typeof x==="boolean")return JSON.stringify(x);
 if(typeof x==="number"){if(!Number.isFinite(x))throw Error("FAST_TICK_NONFINITE");return JSON.stringify(x);}
 if(Array.isArray(x))return "["+x.map(canon).join(",")+"]";
 if(x&&typeof x==="object")return "{"+Object.keys(x).sort().map(k=>
  JSON.stringify(k)+":"+canon(x[k])).join(",")+"}";
 throw Error("FAST_TICK_NON_JSON");
};
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
const b64decode=value=>{
 if(typeof value!=="string"||value.length<60||value.length>6000||
  !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))throw Error("FAST_TICK_KEY_FORMAT_INVALID");
 return Uint8Array.from(atob(value),x=>x.charCodeAt(0));
};
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
/** Keep signing key exclusively in protected Worker secret, not repo/UI. */
export async function signRiskGateFastTick(payload,env){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
   payload.current_evaluation?.execution_authorized!==false)
  throw Error("FAST_TICK_INPUT_INVALID");
 const evaluatedAt=Date.parse(payload.evaluated_at);
 if(!Number.isFinite(evaluatedAt))throw Error("FAST_TICK_TIME_INVALID");
 const canonical_hash=hex(await crypto.subtle.digest("SHA-256",enc.encode(canon(payload))));
 if(!SHA.test(canonical_hash))throw Error("FAST_TICK_DIGEST_FAILED");
 const keyId=String(env?.RISK_GATE_FAST_TICK_KEY_ID??"");
 const secret=String(env?.RISK_GATE_FAST_TICK_PRIVATE_KEY_PKCS8_B64??"");
 if(!secret||!keyId)return {status:"FAST_TICK_KEY_UNAVAILABLE",
  signer:null,canonical_hash:"sha256:"+canonical_hash,ed25519_signature:null,
  evaluated_at:payload.evaluated_at,
  signature_scope:"RESPONSE_AUTHENTICITY_NOT_SOURCE_VERIFICATION"};
 if(!alphabet.test(keyId))throw Error("FAST_TICK_KEY_ID_INVALID");
 try{
  const key=await crypto.subtle.importKey("pkcs8",b64decode(secret),
   {name:"Ed25519"},false,["sign"]);
  const message=enc.encode("geomacro.risk-gate-fast-tick.v1\n"+canonical_hash);
  const signature=await crypto.subtle.sign({name:"Ed25519"},key,message);
  const result={status:"SIGNED",signer:"did:geomacro:authority:"+keyId,
   canonical_hash:"sha256:"+canonical_hash,ed25519_signature:base64(signature),
   evaluated_at:payload.evaluated_at,
   signature_scope:"RESPONSE_AUTHENTICITY_NOT_SOURCE_VERIFICATION"};
  const verification=String(env?.RISK_GATE_FAST_TICK_PUBLIC_KEY_SPKI_B64??"");
  if(!verification)throw Error("FAST_TICK_PUBLIC_KEY_MISSING");
  const pub=await crypto.subtle.importKey("spki",b64decode(verification),
   {name:"Ed25519"},false,["verify"]);
  if(!await crypto.subtle.verify("Ed25519",pub,signature,message))
   throw Error("FAST_TICK_KEY_PAIR_MISMATCH");
  return result;
 }catch(error){
  const reason=String(error?.message??"");
  if(["FAST_TICK_PUBLIC_KEY_MISSING","FAST_TICK_KEY_PAIR_MISMATCH"].includes(reason))
   throw error;
  throw Error("FAST_TICK_SIGNING_UNAVAILABLE");
 }
}
