#!/usr/bin/env node
/**
 * Read-only, OFFLINE 503 recovery prerequisites report, to run on the owner
 * controlled machine. Never outputs a path, SHA, signature, file bytes,
 * credential, issuer identity, article or license contents.
 *
 * File and env existence are NOT genuine signatures, article-specific rights,
 * score certificates or B2/D1 publication. Downstream canonical verification
 * is always required.
 */
import {createHash} from "node:crypto";
import {readFileSync,lstatSync} from "node:fs";
import {isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";

const SHA=/^[a-f0-9]{64}$/u;
const LIMIT=2*1024*1024;
const NONEMPTY=v=>typeof v==="string"&&v.length>0;
const blockedCredentials=[
 "SUPABASE_DB_URL","SUPABASE_URL","APP_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
 "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY",
 "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK",
];
const noFunds=env=>blockedCredentials.every(k=>!NONEMPTY(env[k]));
const fieldState=(env,k)=>NONEMPTY(env[k])?"PRESENT_UNVERIFIED":"ABSENT";
const distinctPins=env=>{
 const a=env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256??"";
 const b=env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256??"";
 return SHA.test(a)&&SHA.test(b)&&a!==b&&
  NONEMPTY(env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM)&&
  NONEMPTY(env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM)&&
  NONEMPTY(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64);
};

export function inspectOwnerArtifact(env,pathKey,pinKey,{maxBytes=LIMIT,
 stat=lstatSync,read=readFileSync}={}){
 const path=env[pathKey],pin=env[pinKey];
 if(!NONEMPTY(path)&&!NONEMPTY(pin))return "NOT_PROVIDED";
 if(!NONEMPTY(path)||!isAbsolute(path))return "ABSOLUTE_PRIVATE_FILE_REQUIRED";
 if(!SHA.test(pin??""))return "64_HEX_PIN_REQUIRED";
 try{
  const f=stat(path);
  if(!f.isFile()||f.isSymbolicLink()||f.size<32||f.size>maxBytes||
    (process.platform!=="win32"&&(f.mode&0o077)!==0))
   return "PRIVATE_FILE_UNSAFE_OR_MISSING";
  const bytes=read(path);
  if(bytes.length!==f.size)return "PRIVATE_BYTES_CHANGED";
  return createHash("sha256").update(bytes).digest("hex")===pin
    ?"EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED"
    :"LOCAL_BYTES_PIN_MISMATCH";
 }catch{return "PRIVATE_FILE_UNSAFE_OR_MISSING"}
}
export function owner503RecoveryPreflight(env=process.env,config={}){
 const safe=noFunds(env);
 const pins=distinctPins(env);
 const budget=env.B2_ACCOUNT_QUOTA_REQUIRED==="1"&&
   env.B2_ACCOUNT_QUOTA_WORKFLOW_ID==="machine_intelligence_signed_staging"&&
   env.B2_REQUEST_BUDGET==="6";
 const services={
  protected_b2_configured:NONEMPTY(env.B2_KEY_ID)&&NONEMPTY(env.B2_APPLICATION_KEY),
  protected_d1_configured:NONEMPTY(env.CLOUDFLARE_ACCOUNT_ID)&&
   NONEMPTY(env.CLOUDFLARE_API_TOKEN)&&NONEMPTY(env.D1_DATABASE_ID)&&
   (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length>=32,
  signed_intelligence_quota_governed:budget,
  different_facts_and_rights_public_pins_present:pins,
  grouser_public_spki_configured:NONEMPTY(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64),
  no_supabase_no_coinbase_no_real_money_ack:safe,
 };
 const machine=inspectOwnerArtifact(env,
  "GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT",
  "GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256",config);
 const historical=inspectOwnerArtifact(env,
  "GEOMACRO_HISTORICAL_B2_READBACK_PATH",
  "GEOMACRO_HISTORICAL_B2_READBACK_SHA256",config);
 const gri={
  reviewed_intelligence:inspectOwnerArtifact(env,"GEOMACRO_REVIEWED_INTELLIGENCE_PATH",
    "GEOMACRO_REVIEWED_INTELLIGENCE_SHA256",config),
  independent_numerical_gri:inspectOwnerArtifact(env,"GEOMACRO_REVIEWED_GRI_PATH",
    "GEOMACRO_REVIEWED_GRI_SHA256",config),
  country_category_certificates:inspectOwnerArtifact(env,"GEOMACRO_COUNTRY_CERTIFICATES_PATH",
    "GEOMACRO_COUNTRY_CERTIFICATES_SHA256",config),
  genuine_historical_b2_baseline:historical,
  independent_reviewer_pin_present:NONEMPTY(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM)&&
   SHA.test(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256??""),
 };
 const missing=[];
 if(!safe)missing.push("REMOVE_FORBIDDEN_FUNDS_OR_SUPABASE_ENVIRONMENT");
 if(!pins)missing.push("CONFIGURE_DISTINCT_APPROVED_PUBLIC_FACTS_RIGHTS_GRO_PINS");
 if(!services.protected_b2_configured||!services.protected_d1_configured)
  missing.push("CONFIGURE_OWNER_PRIVATE_SCOPED_B2_D1_RUNTIME");
 if(!budget)missing.push("SET_EXACT_SHARED_B2_QUOTA_GOVERNOR_LIMITS");
 if(machine!=="EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED")
  missing.push("PROVIDE_REAL_THREE_DOMAIN_DUAL_SIGNED_INTELLIGENCE_BATCH");
 if(historical!=="EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED")
  missing.push("EXPORT_EXACT_HISTORICAL_GRI_B2_ORIGINAL_AND_PIN");
 if(gri.reviewed_intelligence!=="EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED"||
  gri.independent_numerical_gri!=="EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED"||
  gri.country_category_certificates!=="EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED"||
  !gri.independent_reviewer_pin_present)
  missing.push("OBTAIN_GENUINE_INDEPENDENT_GRI_AND_CERTIFICATES");
 missing.push("RUN_CANONICAL_SIGNATURE_RIGHTS_AND_B2_D1_PUBLIC_READBACK");
 missing.push("VERIFY_LIVE_3_OF_3_SNAPSHOTS_AND_DEEP_HEALTH_HTTP_200");
 return Object.freeze({
  schema:"geomacro.owner-private-503-recovery-preflight.v1",
  mode:"OFFLINE_READ_ONLY_NOT_AN_ACCEPTANCE_PROOF",
  environment:services,
  intelligence_immutable_input:machine,
  gri_input_files:gri,
  next_required_actions:missing,
  code_or_operator_claims_commercial_rights:false,
  actual_facts_or_rights_signatures_checked:false,
  actual_grants_or_original_html_checked:false,
  actual_gri_score_or_certificates_checked:false,
  production_b2_d1_readback_checked:false,
  three_hot_products_current_verified:false,
  deep_health_200_verified:false,
  real_funds_enabled:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,real_payments:0,
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(process.argv.length!==2){
  console.error("OWNER_PRIVATE_RECOVERY_PREFLIGHT_ARGUMENTS_INVALID");
  process.exitCode=2;
 }else{
  console.log(JSON.stringify(owner503RecoveryPreflight()));
 }
}
