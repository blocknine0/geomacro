#!/usr/bin/env node
// Predge research-only 90-day Bearer escrow: NEVER reveal root/admin secret,
// derived token, private source rows or buyer/customer data in Actions logs.
// The output is *encrypted ciphertext* for a locally held RSA private key.
import {createHmac,createPublicKey,publicEncrypt,constants} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

export const PREDGE_HMAC_DOMAIN="geomacro-predge-72h-research-only-v1";
export const PREDGE_OAEP_LABEL="geomacro.predge.research-token-handoff.v1";
export const PREDGE_RESEARCH_URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h";
const OUTPUT="artifacts/predge-research-token/predge-research-token.rsa-oaep-sha256.bin";
const error=code=>{throw Error(code)};
export function derivePredgeResearchBearer(root){
  if(typeof root!=="string"||root.length<32||root.length>8192)
    error("PREDGE_HANDOFF_ROOT_SECRET_UNAVAILABLE");
  return createHmac("sha256",root).update(PREDGE_HMAC_DOMAIN).digest("hex");
}
export function decodeRecipientPublicKey(publicKeyB64){
  if(typeof publicKeyB64!=="string"||publicKeyB64.length<350||
     publicKeyB64.length>8192||!(/^[A-Za-z0-9+/]+={0,2}$/).test(publicKeyB64))
    error("PREDGE_HANDOFF_RECIPIENT_PUBLIC_KEY_INVALID");
  const bytes=Buffer.from(publicKeyB64,"base64");
  if(bytes.toString("base64")!==publicKeyB64||
     bytes.length<350||bytes.length>6144)
    error("PREDGE_HANDOFF_RECIPIENT_PUBLIC_KEY_INVALID");
  let key;
  try{key=createPublicKey(bytes)}
  catch{error("PREDGE_HANDOFF_RECIPIENT_PUBLIC_KEY_INVALID")}
  if(key.asymmetricKeyType!=="rsa"||
     (key.asymmetricKeyDetails?.modulusLength??0)<3072||
     (key.asymmetricKeyDetails?.modulusLength??0)>8192)
    error("PREDGE_HANDOFF_RSA_3072_OR_STRONGER_REQUIRED");
  return key;
}
export function sealPredgeResearchBearer({root,recipientPublicKeyB64}={}){
  const key=decodeRecipientPublicKey(recipientPublicKeyB64);
  const token=derivePredgeResearchBearer(root);
  const ciphertext=publicEncrypt({
    key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256",
    oaepLabel:Buffer.from(PREDGE_OAEP_LABEL),
  },Buffer.from(token,"utf8"));
  if(ciphertext.length<384||ciphertext.length>1024)
    error("PREDGE_HANDOFF_SEALED_OUTPUT_INVALID");
  return ciphertext;
}
export async function verifyPredgeLiveBearer({root,fetchImpl=fetch}={}){
  const token=derivePredgeResearchBearer(root);
  const read=async authorized=>{
    let r;
    try{r=await fetchImpl(PREDGE_RESEARCH_URL,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:authorized?{authorization:"Bearer "+token}: {},
      signal:AbortSignal.timeout(15000),
    });}catch{error("PREDGE_HANDOFF_AUTH_ROUTE_UNAVAILABLE")}
    if(![200,401].includes(r.status))error("PREDGE_HANDOFF_AUTH_ROUTE_UNAVAILABLE");
    const body=await r.json().catch(()=>null);
    return {status:r.status,body};
  };
  const anonymous=await read(false);
  if(anonymous.status!==401||anonymous.body?.ok!==false)
    error("PREDGE_HANDOFF_ANONYMOUS_ACCESS_NOT_DENIED");
  const approved=await read(true);
  if(approved.status!==200||approved.body?.ok!==true||
    approved.body.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
    approved.body.partner_delivery_scope!=="PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT"||
    approved.body.partner_resale_or_commercial_redistribution_authorized!==false||
    approved.body.source_licensing_waived!==false||
    approved.body.chargeable!==false||approved.body.gro_signed!==false||
    !Array.isArray(approved.body.items)||approved.body.items.length>600)
    error("PREDGE_HANDOFF_LIVE_RESEARCH_NOT_VERIFIED");
  return Object.freeze({anonymous_denied:true,authenticated_research_verified:true});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3||process.argv[2]!=="--seal-after-live-auth")
      error("PREDGE_HANDOFF_EXPLICIT_MODE_REQUIRED");
    if(process.env.GITHUB_ACTIONS!=="true"||
       process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
       process.env.GITHUB_REF!=="refs/heads/main"||
       process.env.GITHUB_EVENT_NAME!=="workflow_dispatch")
      error("PREDGE_HANDOFF_OWNER_GITHUB_DISPATCH_REQUIRED");
    for(const name of ["SUPABASE_DB_URL","SUPABASE_SERVICE_ROLE_KEY",
      "COINBASE_API_KEY","COINBASE_X402_MAINNET_ACK"])
      if(process.env[name])error("PREDGE_HANDOFF_FUNDS_OR_SUPABASE_FORBIDDEN");
    const root=process.env.ROOT_LEDGER_TOKEN;
    const pub=process.env.RECIPIENT_RSA_PUBKEY_B64;
    // Validate recipient key BEFORE creating any ciphertext.
    decodeRecipientPublicKey(pub);
    const evidence=await verifyPredgeLiveBearer({root});
    const ciphertext=sealPredgeResearchBearer({
      root,recipientPublicKeyB64:pub,
    });
    mkdirSync("artifacts/predge-research-token",{recursive:true,mode:0o700});
    writeFileSync(OUTPUT,ciphertext,{mode:0o600,flag:"wx"});
    console.log(JSON.stringify({
      schema:"geomacro.predge-sealed-owner-token-handoff.v1",
      encrypted_artifact_created:true,
      anonymous_denied:evidence.anonymous_denied,
      authenticated_research_verified:evidence.authenticated_research_verified,
      plaintext_token_in_logs:false,root_secret_exported:false,
      private_key_received:false,commercial_resale_authorized:false,
      real_funds_touched:false,supabase_calls:0,b2_operations:0,
    }));
  }catch{
    console.error("::error::PREDGE_SEALED_TOKEN_HANDOFF_FAILED_CLOSED");
    process.exitCode=2;
  }
}
