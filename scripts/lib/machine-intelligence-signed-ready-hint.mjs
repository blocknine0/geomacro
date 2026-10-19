/**
 * Immutable reviewer-approved MACHINE Intelligence pointer, not proof.
 * This metadata-only hint NEVER issues/signs evidence or waives upstream rights.
 * Existing protected machine publisher independently checks Facts/Rights
 * Ed25519 approvals, real original bytes, B2 pin, D1 readback and clocks.
 */
const HEX=/^[a-f0-9]{64}$/u;
const UTC=/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,3})?Z$/u;
const MAX_AGE_MS=28*60_000;
const PREFIX="geomacro-evidence/v1/private/machine-intelligence-current/";
const NONE=(reason)=>Object.freeze({
  eligible:false,reason,inputs:null,real_signature_checked:false,
  signed_product_published:false,real_funds_touched:false,
  b2_operations:0,d1_writes:0,supabase_requests:0,
});
export function prepareMachineIntelligenceSignedReadyHint({
  inputSha,approvedAt,now=new Date(),
}={}){
  if([inputSha,approvedAt].every(x=>x===undefined||x===""))
    return NONE("NO_EXTERNALLY_APPROVED_MACHINE_INPUT");
  if(typeof inputSha!=="string"||!HEX.test(inputSha))
    return NONE("INVALID_OR_MISSING_PINNED_MACHINE_INPUT_SHA");
  if(typeof approvedAt!=="string"||!UTC.test(approvedAt))
    return NONE("INVALID_OR_MISSING_MACHINE_APPROVAL_TIME");
  const ms=now instanceof Date?now.getTime():NaN,at=Date.parse(approvedAt);
  if(!Number.isFinite(ms)||!Number.isFinite(at)||at>ms||
     ms-at>=MAX_AGE_MS)
    return NONE("STALE_OR_FUTURE_MACHINE_APPROVAL_HINT");
  return Object.freeze({
    eligible:true,
    reason:"APPROVED_POINTER_HINT_ONLY_PROTECTED_REVALIDATION_REQUIRED",
    inputs:Object.freeze({
      machine_b2_key:PREFIX+inputSha+".json",
      machine_b2_sha256:inputSha,
    }),
    real_signature_checked:false,
    signed_product_published:false,
    real_funds_touched:false,b2_operations:0,d1_writes:0,supabase_requests:0,
  });
}
export function assertMachineIntelligencePublisherTarget(name){
  if(name!=="intelligence-machine-current.yml")
    throw Error("ONLY_PROTECTED_MACHINE_INTELLIGENCE_PUBLISHER_ALLOWED");
  return name;
}
