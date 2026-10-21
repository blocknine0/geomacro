#!/usr/bin/env node
/**
 * Hosted, READ-ONLY readiness of existing GitHub production environment.
 * No credentials, PEMs, fingerprints, file paths or article material printed.
 * A valid PUBLIC key is not an approved legal grant, private signer, reviewer
 * signature, historical B2 restoration or signed current hot product.
 */
import {createHash,createPublicKey} from "node:crypto";
import {fileURLToPath} from "node:url";
const HEX=/^[a-f0-9]{64}$/u;
const PRESENT=v=>typeof v==="string"&&v.trim().length>0;
const BLOCKED=[
 "SUPABASE_DB_URL","SUPABASE_URL","APP_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
 "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY",
 "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"
];
const state=ok=>ok?"PRESENT_NOT_LIVE_VERIFIED":"MISSING_OR_INVALID";
function ed25519Pem(pem,pin) {
 if(!PRESENT(pem)||!HEX.test(pin??""))return null;
 try{
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=="ed25519")return null;
  const der=key.export({format:"der",type:"spki"});
  const hash=createHash("sha256").update(der).digest("hex");
  return hash===pin?hash:null;
 }catch{return null}
}
function ed25519B64(b64) {
 if(!PRESENT(b64)||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return null;
 try{
  const key=createPublicKey({key:Buffer.from(b64,"base64"),format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")return null;
  const der=key.export({format:"der",type:"spki"});
  return createHash("sha256").update(der).digest("hex");
 }catch{return null}
}
export function cloudAuthorityReadiness(env=process.env) {
 const noFunds=BLOCKED.every(k=>!PRESENT(env[k]));
 const b2=PRESENT(env.B2_KEY_ID)&&PRESENT(env.B2_APPLICATION_KEY);
 const d1=PRESENT(env.CLOUDFLARE_ACCOUNT_ID)&&
  PRESENT(env.CLOUDFLARE_API_TOKEN)&&
  (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length>=32;
 const facts=ed25519Pem(env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM,
  env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256);
 const rights=ed25519Pem(env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM,
  env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256);
 const gro=ed25519B64(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64);
 const distinct=Boolean(facts&&rights&&gro&&
  facts!==rights&&facts!==gro&&rights!==gro);
 const reviewer=ed25519Pem(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
  env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256);
 const reviewerIndependent=Boolean(reviewer&&gro&&reviewer!==gro&&
  reviewer!==facts&&reviewer!==rights);
 const endpoints={
  archive_storage_credentials:state(b2),
  cloudflare_control_plane_credentials:state(d1),
  three_distinct_facts_rights_gro_public_key_pins:distinct
    ?"PINS_CRYPTOGRAPHICALLY_MATCH_AND_DISTINCT":"MISSING_OR_INVALID",
  independent_gri_reviewer_public_key:reviewerIndependent
    ?"PIN_MATCHED_DISTINCT_FROM_SIGNERS":"MISSING_OR_INVALID",
  zero_money_and_supabase_boundary:noFunds?"PRESENT":"VIOLATED",
 };
 // A short reason list is a safe whitelist, not a diagnostic copy of env.
 const actions=[];
 if(!b2)actions.push("RESTORE_EXISTING_PRODUCTION_B2_SCOPED_CREDENTIALS");
 if(!d1)actions.push("RESTORE_EXISTING_PRODUCTION_CLOUDFLARE_D1_SCOPE");
 if(!distinct)actions.push("CONFIGURE_ACTUAL_DISTINCT_APPROVED_PUBLIC_FACTS_RIGHTS_GRO_PINS");
 if(!reviewerIndependent)actions.push("CONFIGURE_APPROVED_INDEPENDENT_GRI_REVIEWER_PUBLIC_PIN");
 if(!noFunds)actions.push("REMOVE_FORBIDDEN_LEGACY_OR_REAL_MONEY_ENV");
 actions.push("OBTAIN_REAL_THREE_DOMAIN_SOURCE_RIGHTS_DUAL_SIGNED_INPUT");
 actions.push("OBTAIN_REAL_SIGNED_REVIEWED_GRI_AND_COUNTRY_CERTIFICATES");
 actions.push("VERIFY_IMMUTABLE_B2_D1_AND_ACTUAL_THREE_HOT_PUBLIC_200");
 return Object.freeze({
  schema:"geomacro.hosted-authority-configuration-readiness.v1",
  mode:"HOSTED_GITHUB_PRODUCTION_METADATA_ONLY",
  laptop_continuous_runtime_required:false,
  authority_public_pins_checked:true,
  configuration:endpoints,
  configuration_passed:b2&&d1&&distinct&&reviewerIndependent&&noFunds,
  next_actions:actions,
  facts_signature_verified:false,
  rights_signature_verified:false,
  actual_article_commercial_rights_verified:false,
  independent_reviewer_signature_verified:false,
  approved_signed_batches_present_verified:false,
  b2_object_get_performed:false,
  production_d1_readback_performed:false,
  live_three_hot_snapshots_verified:false,
  deep_health_http_200_verified:false,
  no_signer_private_keys_loaded:true,
  b2_requests:0,d1_writes:0,supabase_requests:0,real_payments:0,
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(process.argv.length!==2){
  console.error("CLOUD_AUTHORITY_READINESS_ARGUMENTS_INVALID");
  process.exitCode=2;
 }else{
  try{
   const receipt=cloudAuthorityReadiness();
   process.stdout.write(JSON.stringify(receipt)+"\n");
   if(!receipt.configuration_passed)process.exitCode=2;
  }catch{
   console.error("CLOUD_AUTHORITY_READINESS_FAILED_CLOSED");
   process.exitCode=2;
  }
 }
}
