#!/usr/bin/env node
/** Read-only provider-verified Phase2H raw prefix B2 1+1-day expiration.
 * No updateBucket, no new B2 PUT, no PREDGE or other bucket lifecycle rules.
 * Both B2 native read attempts use the EXISTING atomic D1 quota governor.
 */
export const PHASE2H_B2_PREFIX="geomacro-evidence/v1/private/phase2h-raw-news/";
const fail=code=>{throw Error("PHASE2H_B2_72H_"+code)};
export function assertPhase2hB2Lifecycle(rules){
 if(!Array.isArray(rules))fail("LIFECYCLE_UNVERIFIED");
 // Backblaze applies the shortest matching lifecycle rule; 1+1 days
 // ensures deletion within the documented maximum 72h after upload.
 // A broad bucket-wide rule is NOT sufficient: it could expire PREDGE or
 // unrelated private/historical evidence. Require explicit raw-only scope.
 const covered=rules.filter(rule=>rule?.fileNamePrefix===PHASE2H_B2_PREFIX);
 // The hide/delete pair must be from ONE exact-prefix rule. Taking
 // independent minima across unrelated rules can falsely report compliance.
 const valid=covered.some(r=>r.daysFromUploadingToHiding===1&&
  r.daysFromHidingToDeleting===1);
 if(!valid)fail("THREE_DAY_EXPIRY_NOT_PROVEN");
 return Object.freeze({schema:"geomacro.phase2h.b2-72h-lifecycle.v1",
  phase2h_raw_prefix_verified:true,max_days_to_hide:1,max_days_after_hide:1,
  deletion_within_three_days_provider_rule:true,
  previous_b2_object_versions_independently_deleted:false,
  no_bucket_mutation:true,other_b2_prefixes_untouched:true});
}
/** Fail closed until the bucket owner removes all provider-side rules
 * capable of hiding or deleting the Phase2H original-news prefix. This
 * DOES NOT modify Backblaze bucket settings or unrelated bucket prefixes.
 */
export function assertPhase2hB2ManualRetention(rules){
 if(!Array.isArray(rules))fail("LIFECYCLE_UNVERIFIED");
 const matching=rules.filter(rule=>{
  if(!rule||typeof rule!=="object")fail("LIFECYCLE_UNVERIFIED");
  const prefix=rule.fileNamePrefix;
  if(typeof prefix!=="string")fail("LIFECYCLE_UNVERIFIED");
  return PHASE2H_B2_PREFIX.startsWith(prefix)||
    prefix.startsWith(PHASE2H_B2_PREFIX);
 });
 // Any matching auto-hide or auto-delete rule is forbidden. Native 1+1-day
 // expiry cannot be paused by changing GitHub Actions scheduling.
 if(matching.some(rule=>
    rule.daysFromUploadingToHiding!=null||
    rule.daysFromHidingToDeleting!=null))
  fail("AUTOMATIC_DELETION_STILL_ENABLED");
 return Object.freeze({
  schema:"geomacro.phase2h.b2-manual-retention.v1",
  phase2h_raw_prefix_verified:true,auto_deletion_paused:true,
  deletion_within_three_days_provider_rule:false,
  no_bucket_mutation:true,other_b2_prefixes_untouched:true,
 });
}
async function readPrivateB2LifecycleRules({
 env=process.env,
}={}){
 // B2 bucket/key listing is disabled by policy. Lifecycle settings must be
 // applied and verified in the Backblaze Console; no provider list API is
 // called from application code.
 void env;
 fail("CONSOLE_LIFECYCLE_VERIFICATION_REQUIRED");
}
/** Separate strict 72h ciphertext-only queue prefix; never alter raw B2 rules. */
export const PHASE2I_SOURCE_QUEUE_B2_PREFIX=
 "geomacro-evidence/v1/private/phase2i-source-queue/";
export function assertPhase2iSourceB2Lifecycle(rules){
 if(!Array.isArray(rules))fail("SOURCE_QUEUE_LIFECYCLE_MISSING");
 // Require one exact-prefix rule. Two unrelated rules do not prove a valid
 // hide/delete sequence; a broader auto-expiry could destroy the queue early.
 const exact=rules.filter(x=>x?.fileNamePrefix===PHASE2I_SOURCE_QUEUE_B2_PREFIX);
 if(!exact.some(x=>x.daysFromUploadingToHiding===1&&
     x.daysFromHidingToDeleting===1))
  fail("SOURCE_QUEUE_72H_EXPIRY_UNVERIFIED");
 if(rules.some(r=>r?.fileNamePrefix!==PHASE2I_SOURCE_QUEUE_B2_PREFIX&&
    typeof r?.fileNamePrefix==="string"&&
    PHASE2I_SOURCE_QUEUE_B2_PREFIX.startsWith(r.fileNamePrefix)&&
    (r.daysFromUploadingToHiding!=null||
     r.daysFromHidingToDeleting!=null)))
  fail("SOURCE_QUEUE_BROAD_LIFECYCLE_CONFLICT");
 if(exact.some(x=>x.daysFromUploadingToHiding!==1||
    x.daysFromHidingToDeleting!==1))
  fail("SOURCE_QUEUE_EXACT_LIFECYCLE_CONFLICT");
 return Object.freeze({
  schema:"geomacro.phase2i.source-queue-b2-72h-lifecycle.v1",
  phase2i_source_queue_prefix_verified:true,
  private_72h_delete_lifecycle_verified:true,
  native_hide_days:1,native_delete_after_hide_days:1,
  no_bucket_mutation:true,other_prefixes_unchanged:true
 });
}
export async function verifyPhase2hB2Lifecycle(args={}){
 return assertPhase2hB2ManualRetention(await readPrivateB2LifecycleRules(args));
}
export async function verifyPhase2iSourceB2Lifecycle(args={}){
 return assertPhase2iSourceB2Lifecycle(await readPrivateB2LifecycleRules(args));
}
if(process.argv[1]?.endsWith("/phase2h-verify-b2-72h-lifecycle.mjs")){
 try{console.log(JSON.stringify(await verifyPhase2hB2Lifecycle()))}
 catch(e){const m=String(e?.message??"");
  console.error(/^PHASE2H_B2_72H_[A-Z_]+$/u.test(m)?m:
   "PHASE2H_B2_72H_PROVIDER_PROOF_UNAVAILABLE");process.exitCode=2}
}
