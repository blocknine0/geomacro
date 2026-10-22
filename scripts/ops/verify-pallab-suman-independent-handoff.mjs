#!/usr/bin/env node
// Exact PRIVATE Pallab+Suman 2-authority acceptance, independent original
// review, certified cells and actual historic B2 readback. ZERO NETWORK.
// Never upload signatures, private article bytes or private keys to GitHub.
import {readFileSync,statSync} from "node:fs";
import {createHash,createPublicKey} from "node:crypto";
import {pathToFileURL} from "node:url";
import {validatePallabSumanPrivateHandoff}
 from "../lib/pallab-suman-reviewed-handoff.mjs";
const SHA=/^[a-f0-9]{64}$/u;
const fail=x=>{throw Error("PALLAB_SUMAN_PRIVATE_HANDOFF_"+x)};
function pinned(env,prefix,max){
 const path=env[prefix+"_PATH"],pin=env[prefix+"_SHA256"];
 if(typeof path!=="string"||!SHA.test(pin??""))fail("EXACT_PRIVATE_FILE_AND_PIN_REQUIRED");
 const size=statSync(path).size;
 if(size<25||size>max)fail("PRIVATE_INPUT_SIZE_INVALID");
 const bytes=readFileSync(path);
 if(createHash("sha256").update(bytes).digest("hex")!==pin)
  fail("EXACT_PRIVATE_BYTES_MISMATCH");
 return bytes;
}
export function verifyPrivatePallabSumanPaths(env=process.env,{now=new Date()}={}){
 for(const k of ["SUPABASE_DB_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
  "APP_SUPABASE_URL","APP_SUPABASE_SERVICE_ROLE_KEY","B2_KEY_ID",
  "B2_APPLICATION_KEY","CLOUDFLARE_API_TOKEN","COINBASE_API_KEY",
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK","COINBASE_X402_MAINNET_ACK"]){
  if(env[k])fail("PROTECTED_OFFLINE_NO_FUNDS_REQUIRED");
 }
 const ownerApprovalBytes=pinned(env,"GEOMACRO_OWNER_SIGNED_APPROVAL",8_192);
 const reviewedGriBytes=pinned(env,"GEOMACRO_REVIEWED_GRI",1_048_576);
 const countryCertificateBytes=pinned(env,"GEOMACRO_COUNTRY_CERTIFICATES",524_288);
 const intelBytes=pinned(env,"GEOMACRO_REVIEWED_INTELLIGENCE",1_048_576);
 const historicalB2Bytes=pinned(env,"GEOMACRO_HISTORICAL_B2_READBACK",2_097_152);
 let intelligence;
 try{intelligence=JSON.parse(intelBytes.toString("utf8"));}
 catch{fail("INTELLIGENCE_JSON_INVALID");}
 let groSignerPublicSpkiSha256;
 try{
  const key=createPublicKey({key:Buffer.from(
   env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"","base64"),
   format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")fail("GRO_SIGNER_PUBLIC_KEY_INVALID");
  groSignerPublicSpkiSha256=createHash("sha256")
   .update(key.export({format:"der",type:"spki"})).digest("hex");
 }catch{fail("GRO_SIGNER_PUBLIC_KEY_INVALID");}
 return validatePallabSumanPrivateHandoff({
  ownerApprovalBytes,reviewedGriBytes,countryCertificateBytes,
  intelligence,historicalB2Bytes,
  ownerPublicKeyPem:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
  ownerPublicKeySpkiSha256:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256,
  reviewerPublicKeyPem:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
  reviewerPublicKeySpkiSha256:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256,
  groSignerPublicSpkiSha256,
  otherAuthoritySpkiSha256:[
    env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
    env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256
  ].filter(Boolean),
  now
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=="--validate-offline-no-funds")
    fail("EXPLICIT_OFFLINE_VALIDATE_ONLY");
  const receipt=verifyPrivatePallabSumanPaths();
  console.log(JSON.stringify(receipt));
 }catch{console.error("PALLAB_SUMAN_PRIVATE_HANDOFF_NOT_ACCEPTED");
   process.exitCode=2;}
}
