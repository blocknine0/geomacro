#!/usr/bin/env node
// Read-only, isolated protected issuer audit: NEVER prints or exports secret.
import {createHash,createPrivateKey,createPublicKey,timingSafeEqual} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const hex=/^[a-f0-9]{64}$/u;
const digest=(k)=>createHash("sha256").update(
  k.export({format:"der",type:"spki"})).digest("hex");
const equal=(x,y)=>{const a=Buffer.from(x,"hex"),b=Buffer.from(y,"hex");
  return a.length===b.length&&timingSafeEqual(a,b);};
export function auditIssuerPrivateKey(env=process.env){
  const role=env.GEOMACRO_MACHINE_KEY_AUDIT_ROLE;
  if(role!=="facts"&&role!=="rights")throw Error("AUDIT_ROLE_INVALID");
  const result=(state)=>({
    schema:"geomacro.machine-key-presence-audit.v1",role,
    scope:"CURRENT_PROTECTED_EXECUTION_ENVIRONMENT_ONLY",
    state,issuer_private_key_available:state==="PINNED_PRIVATE_KEY_MATCH",
    issued_event_signature:false,article_rights_verified:false,
    source_read:false,b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  });
  const raw=env.GEOMACRO_MACHINE_KEY_AUDIT_PRIVATE_PKCS8_B64;
  if(!raw)return result("NOT_AVAILABLE_IN_THIS_ENVIRONMENT");
  try {
    const pin=env.GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_SHA256;
    const pem=env.GEOMACRO_MACHINE_KEY_AUDIT_PUBLIC_PEM;
    const gro=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
    if(!hex.test(pin??"")||!pem||!gro||
       !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||raw.length>8192)
      return result("PRIVATE_KEY_OR_PIN_INVALID");
    const privateKey=createPrivateKey({
      key:Buffer.from(raw,"base64"),format:"der",type:"pkcs8"});
    const publicKey=createPublicKey(privateKey);
    const pinned=createPublicKey(pem);
    const signer=createPublicKey({
      key:Buffer.from(gro,"base64"),format:"der",type:"spki"});
    if(privateKey.asymmetricKeyType!=="ed25519"||
       pinned.asymmetricKeyType!=="ed25519"||
       signer.asymmetricKeyType!=="ed25519"||
       !equal(digest(publicKey),pin)||
       !equal(digest(pinned),pin)||
       equal(digest(publicKey),digest(signer)))
      return result("PRIVATE_KEY_OR_PIN_INVALID");
    return result("PINNED_PRIVATE_KEY_MATCH");
  }catch {return result("PRIVATE_KEY_OR_PIN_INVALID");}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const r=auditIssuerPrivateKey();console.log(JSON.stringify(r));
    if(r.state!=="PINNED_PRIVATE_KEY_MATCH")process.exitCode=2;
  }catch{console.error("MACHINE_PRIVATE_KEY_AUDIT_REJECTED");process.exitCode=3;}
}
