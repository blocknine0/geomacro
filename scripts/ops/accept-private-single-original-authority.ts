#!/usr/bin/env bun
/**
 * Protected one-original FACTS + RIGHTS verifier. This is not GRO signing,
 * public hot publication, D1 write, Supabase or customer settlement.
 * Inputs must be private 0600 bytes already separately signed by two
 * trusted authorities. Logs contain only sanitized status and hashes.
 */
import {readFileSync,realpathSync,lstatSync,statSync} from "node:fs";
import {resolve,sep,basename} from "node:path";
import {createHash} from "node:crypto";
import {preparePrivateSingleOriginalFactualHandoff} from
  "../../src/lib/single-original-private-derived-handoff.server";

const deny=(code:string)=>{throw Error(code)};
const PIN=/^[a-f0-9]{64}$/u;
const errorCode="PRIVATE_SINGLE_ORIGINAL_NO_FUNDS_ADMISSION_FAILED";
export async function runPrivateSingleOriginalOperator({
  argv=process.argv.slice(2),env=process.env,
}:{
  argv?:string[];
  env?:Record<string,string|undefined>;
}={}){
  if(argv.length!==2||!argv[0].startsWith("--input=")||
     !argv[1].startsWith("--sha256="))deny("EXPLICIT_INPUT_AND_SHA_REQUIRED");
  const pin=argv[1].slice("--sha256=".length);
  if(!PIN.test(pin))deny("EXACT_INPUT_PIN_REQUIRED");
  // Never allow an ungoverned B2 GET or dormant Supabase/payments to be
  // silently activated by this private operator.
  if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
     !env.D1_DATABASE_ID||!env.CLOUDFLARE_ACCOUNT_ID||
     !env.CLOUDFLARE_API_TOKEN||
     !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
     env.COINBASE_X402_MAINNET_ACK||
     env.GEOMACRO_COMMERCIAL_LAUNCH_ACK||
     env.SUPABASE_URL||env.SUPABASE_DB_URL||
     env.SUPABASE_SERVICE_ROLE_KEY||env.APP_SUPABASE_URL||
     env.APP_SUPABASE_SERVICE_ROLE_KEY)
    deny("NO_FUNDS_AND_QUOTA_CONFIG_REQUIRED");
  const root=env.GEOMACRO_PRIVATE_REVIEW_DIR;
  if(!root)deny("PRIVATE_ROOT_REQUIRED");
  const base=realpathSync(resolve(root));
  if((statSync(base).mode&0o077)!==0)deny("PRIVATE_ROOT_PERMISSIONS_INVALID");
  const input=resolve(argv[0].slice("--input=".length));
  // Strict path and immutable content-addressed filename, no traversal,
  // hidden symlink, source URLs in logs or arbitrary file writes.
  const file=realpathSync(input);
  if(!file.startsWith(base+sep)||basename(file)!==pin+".json"||
     lstatSync(input).isSymbolicLink())deny("PINNED_PRIVATE_FILE_REQUIRED");
  const st=statSync(file);
  if(!st.isFile()||(st.mode&0o077)!==0||
     st.size<200||st.size>2*1024*1024)
    deny("PRIVATE_FILE_MODE_OR_SIZE_INVALID");
  const bytes=readFileSync(file);
  if(createHash("sha256").update(bytes).digest("hex")!==pin)
    deny("EXACT_PRIVATE_BYTES_HASH_MISMATCH");
  const inputJson=JSON.parse(bytes.toString("utf8"));
  if(!inputJson||typeof inputJson!=="object"||Array.isArray(inputJson)||
     Object.keys(inputJson).sort().join(",")!=="candidate,envelope")
    deny("PRIVATE_INPUT_CONTRACT_INVALID");
  const qualified=await preparePrivateSingleOriginalFactualHandoff({
    candidate:inputJson.candidate,
    envelope:inputJson.envelope,
    authorityEnvironment:env,
  });
  const fact=qualified.derived_input;
  return Object.freeze({
    schema:"geomacro.protected-single-original-no-funds-operator.v1",
    accepted:qualified.accepted,
    status:qualified.reason,
    original_reread_verified:qualified.accepted,
    distinct_facts_rights_signatures_verified:qualified.accepted,
    source_rights_registry_compatible:qualified.accepted,
    original_count:1,
    independently_corroborated:false,
    source_input_sha256:pin,
    proof_sha256:fact?.dual_authority_proof_sha256??null,
    qualified_until:fact?.qualified_until??null,
    derived_factual_input_sha256:qualified.derived_input_sha256,
    derived_factual_input_type:fact?.product_type??null,
    owner_output_license_id:qualified.accepted?
      qualified.owner_output_license?.schema??null:null,
    owner_output_use_granted:qualified.accepted?
      qualified.owner_output_license?.owner_output_use_granted===true:false,
    // Owner-created expression is not upstream publisher permission.
    third_party_source_permission_self_granted:false,
    signed_commercial_gro:false,
    public_hot_published:false,
    gri_current_certified:false,
    x402_chargeable:false,
    b2_writes:0,d1_writes:0,supabase_writes:0,payments:0,
  });
}
if(import.meta.main){
  try{
    const receipt=await runPrivateSingleOriginalOperator();
    // No article data, licence contents, identities or URLs in output.
    console.log(JSON.stringify(receipt));
    if(!receipt.accepted)process.exitCode=2;
  }catch{
    console.error(errorCode);
    process.exitCode=2;
  }
}
