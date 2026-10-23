// Restore the legacy automatic compute/verify rhythm without restoring the
// retired Supabase or prediction-market producer. REAL canonical scored events
// only. This is an internal research computation, never a commercial GRI.
import {createHash} from "node:crypto";
import {canonicalJson,calculateGri,GRI_CATEGORIES} from "./gri-engine-v12.js";
import {buildPrivateSupabaseFreeGriProof} from "./gri-v12-private-offline-admission.mjs";
const SHA=/^[a-f0-9]{64}$/u;
const PREFIX="geomacro-evidence/v1/private/gri-auto-canonical-input/";
const deny=code=>{throw Error("GRI_LEGACY_AUTO_RECOMPUTE_"+code)};
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");

export function legacyAutoGriInputPointer(env={}){
 const pin=String(env.GEOMACRO_GRI_AUTO_SCORED_INPUT_SHA256??"").trim();
 const key=String(env.GEOMACRO_GRI_AUTO_SCORED_INPUT_B2_KEY??"").trim();
 if(!pin&&!key)return null;
 if(!SHA.test(pin)||key!==PREFIX+pin+".json")deny("EXACT_PRIVATE_SCORED_INPUT_PIN_REQUIRED");
 return Object.freeze({pin,key});
}
export function legacyAutoGriProtectedContext(env={}){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
    env.GEOMACRO_GRI_AUTO_ENROLLED!=="YES_CONSENT_ONLY"||
    env.GEOMACRO_GRI_AUTO_REVOKED==="YES"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="gri_legacy_recompute"||
    env.B2_REQUEST_BUDGET!=="3"||
    ["SUPABASE_URL","APP_SUPABASE_URL","SUPABASE_DB_URL",
      "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
      "COINBASE_API_KEY","COINBASE_X402_MAINNET_ACK",
      "GEOMACRO_COMMERCIAL_LAUNCH_ACK"].some(k=>Boolean(env[k])))
   deny("PROTECTED_CONSENTED_NO_FUNDS_MAIN_REQUIRED");
 return true;
}
export function calculateResearchOnlyGriFromExactBytes({
 bytes,expectedSha256,now=new Date()
}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length<200||bytes.length>768_000||
    !SHA.test(expectedSha256??"")||hash(bytes)!==expectedSha256)
   deny("EXACT_CANONICAL_INPUT_BYTES_REQUIRED");
 let admission;
 try{admission=JSON.parse(bytes.toString("utf8"))}catch{
  deny("PRIVATE_SCORED_INPUT_JSON_INVALID");
 }
 const canonicalInputSha256=hash(Buffer.from(canonicalJson(admission)));
 const proof=buildPrivateSupabaseFreeGriProof({
  admission,expectedInputSha256:canonicalInputSha256,now
 });
 if(proof.private_only!==true||proof.commercial_eligible!==false||
    proof.current_coverage!==1||proof.event_count!==admission.events.length||
    proof.current_categories.length!==3)
   deny("RESEARCH_ONLY_THREE_DOMAIN_PROOF_REQUIRED");
 const score=calculateGri(admission.events,new Date(admission.as_of));
 if(!Number.isFinite(score.displayScore)||score.coverage!==1||
    !GRI_CATEGORIES.every(c=>score.activeCategories.includes(c)))
   deny("CANONICAL_NUMERICAL_RECOMPUTATION_INVALID");
 return Object.freeze({
  schema:"geomacro.gri-legacy-automatic-research-recompute.v1",
  status:"CANONICAL_V12_PRIVATE_RESEARCH_SCORE_COMPUTED_NOT_SIGNED",
  methodology:"gri-v1.2.0",
  native_observation_as_of:admission.as_of,
  three_domain_coverage:score.coverage,
  category_event_counts:Object.fromEntries(GRI_CATEGORIES.map(c=>[
   c,admission.events.filter(row=>row.category===c).length
  ])),
  // Score stays in private-run memory. Public workflow receipt is only a
  // proof hash + counts, not a commercial or customer GRI value.
  private_research_score:score.displayScore,
  private_proof_sha256:proof.portable_proof_hash,
  source_rights_independently_qualified:false,
  independent_human_numeric_reviewed:false,
  country_certificates_issued:false,
  commercially_published:false,
  public_current_gri:false,
  x402_accepted:false,
  b2_puts:0,d1_writes:0,supabase_requests:0,payments:0
 });
}
export async function runLegacyAutoGriResearch({
 env=process.env,b2Factory,resolveQuotaDatabase,now=new Date()
}={}){
 // Missing enrollment is a truthful decline, not license to fall back to
 // legacy ungoverned code or ask an unattended runner for a human key.
 if(env.GEOMACRO_GRI_AUTO_ENROLLED!=="YES_CONSENT_ONLY"||
    env.GEOMACRO_GRI_AUTO_REVOKED==="YES")
  return Object.freeze({
   schema:"geomacro.gri-legacy-automatic-research-recompute.v1",
   status:"TWO_PERSON_STANDING_AUTOMATION_CONSENT_NOT_ACTIVE",
   private_input_available:false,score_computed:false,
   b2_requests:0,d1_writes:0,payments:0
  });
 legacyAutoGriProtectedContext(env);
 const pointer=legacyAutoGriInputPointer(env);
 if(!pointer)return Object.freeze({
  schema:"geomacro.gri-legacy-automatic-research-recompute.v1",
  status:"NO_CURRENT_THREE_DOMAIN_CANONICAL_SCORED_INPUT",
  private_input_available:false,score_computed:false,
  signed_free_journal_is_not_numerical_gri:true,
  original_article_rights_assumed:false,
  b2_requests:0,d1_writes:0,payments:0
 });
 if(typeof b2Factory!=="function"||typeof resolveQuotaDatabase!=="function")
  deny("GOVERNED_PRIVATE_B2_READER_REQUIRED");
 // A score-ready private research input remains immutable. The hourly job
 // cannot invent event severities, timestamps, classifier hashes or sources.
 const database=await resolveQuotaDatabase(env);
 if(!/^[a-f0-9-]{36}$/iu.test(database??""))deny("D1_QUOTA_DATABASE_INVALID");
 // Per-attempt B2 accounting is enforced by createB2Client using shared D1.
 const b2=b2Factory({...env,D1_DATABASE_ID:database});
 const bytes=Buffer.from(await b2.get(pointer.key));
 const proof=calculateResearchOnlyGriFromExactBytes({
  bytes,expectedSha256:pointer.pin,now
 });
 const {private_research_score,...publicSafe}=proof;
 return Object.freeze({
  ...publicSafe,
  research_score_not_published:true,
  preview_score_secret_not_in_public_receipt:true,
  publisher_signed_gri_verified:false,
  b2_reads_minimum:1,
  b2_puts:0,payments:0
 });
}
