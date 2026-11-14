/** Exact Cloudflare Worker binding parity with separately reviewed additive secrets. */
export const REVIEWABLE_ADDITIVE_SECRETS=Object.freeze([
  "GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",
  "GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64",
  "GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64",
  "RISK_STREAM_INDEX_LEAD_BEARER",
  "PREDGE_PAID_RISK_GATE_TOKEN",
  "RISK_STREAM_GRO_SIGN_PKCS8_B64",
  "RISK_STREAM_GRO_VERIFY_SPKI_B64",
  "RISK_STREAM_MACHINE_FACTS_SPKI_B64",
  "RISK_STREAM_MACHINE_RIGHTS_SPKI_B64",
  "RISK_STREAM_AES256_KEY_B64",
  "RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256",
  "GEOMACRO_LICENSED_WEBHOOK_DOMAINS"
]);
const PREDGE_TRIAL_VARS=Object.freeze({
 PREDGE_PAID_TRAFFIC_ENABLED:"NO",
 PREDGE_PAID_GO_LIVE_CROSSCHECK:"",
 PREDGE_MUTUAL_TRIAL_STARTED_AT:""
});
const TRIAL_START=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/u;
const deny=code=>{throw Error("CANARY_BINDINGS_"+code)};
export function bindingInventory(version){
  const raw=version?.resources?.bindings;
  if(!raw)deny("UNAVAILABLE");
  const rows=Array.isArray(raw)?raw:Object.entries(raw).flatMap(([type,values])=>
    Array.isArray(values)?values.map(v=>({...v,type:v.type??type})):[]
  );
  if(!rows.length)deny("EMPTY");
  const map=new Map();
  for(const row of rows){
    if(typeof row?.name!=="string"||!row.name||
       typeof row?.type!=="string"||!row.type||map.has(row.name))
      deny("INVALID_OR_DUPLICATE");
    map.set(row.name,row.type);
  }
  return map;
}
export function assessReviewedAdditiveBindingParity(base,candidate,reviewed=[]){
  const a=bindingInventory(base),b=bindingInventory(candidate);
  for(const [name,type] of a){
    if(b.get(name)!==type)deny("REMOVAL_OR_TYPE_CHANGE_"+name);
  }
  const additions=[...b.keys()].filter(name=>!a.has(name)).sort();
  const accepted=[...new Set(reviewed)].sort();
  if(reviewed.length!==accepted.length)deny("DUPLICATE_REVIEWED_NAME");
  if(additions.length!==accepted.length||
     additions.some((name,i)=>name!==accepted[i]))
    deny("UNREVIEWED_ADDITION");
  for(const name of additions){
    if(!REVIEWABLE_ADDITIVE_SECRETS.includes(name)||b.get(name)!=="secret_text")
      deny("ADDITIVE_SECRET_TYPE_OR_SCOPE_"+name);
  }
  return Object.freeze({status:"PASS_BINDING_PARITY",additions,
    baseline_count:a.size,candidate_count:b.size});
}

// Strict reviewed transition for zero-traffic Hot50 research Workers.
// This does not authorize payment, certified Risk Indices or release-hold removal.
export const REVIEWED_HOT50_RUNTIME_VARS=Object.freeze({
 RISK_GATE_COUNTRY_SCOPE:"HOT50",
 RISK_STREAM_ACTIVE:"0",
 STREAM_INGESTION_ENABLED:"false",
 STREAM_MODE:"DISABLED",
 RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"0",
 GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
 RISK_STREAM_CANARY_HOLD_CLEARED:"0",
 RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"0"
});
export function reviewedHot50CandidateVars(sha,predgeRuntimeVars={}){
 if(!/^[a-f0-9]{40}$/.test(sha))deny("SOURCE_SHA_INVALID");
 const stream={
  RISK_STREAM_ACTIVE:predgeRuntimeVars.RISK_STREAM_ACTIVE??REVIEWED_HOT50_RUNTIME_VARS.RISK_STREAM_ACTIVE,
  STREAM_INGESTION_ENABLED:predgeRuntimeVars.STREAM_INGESTION_ENABLED??REVIEWED_HOT50_RUNTIME_VARS.STREAM_INGESTION_ENABLED,
  STREAM_MODE:predgeRuntimeVars.STREAM_MODE??REVIEWED_HOT50_RUNTIME_VARS.STREAM_MODE,
  RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:predgeRuntimeVars.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED??REVIEWED_HOT50_RUNTIME_VARS.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED,
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
  RISK_STREAM_CANARY_HOLD_CLEARED:"0",
  RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"0"
 };
 if(!["0","1"].includes(stream.RISK_STREAM_ACTIVE)||
    !["false","true"].includes(stream.STREAM_INGESTION_ENABLED)||
    !["DISABLED","PRODUCTION"].includes(stream.STREAM_MODE)||
    !["0","1"].includes(stream.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED)||
    !["0","1"].includes(stream.GEOMACRO_COMMERCIAL_STREAM_RELEASE)||
    !["0","1"].includes(stream.RISK_STREAM_CANARY_HOLD_CLEARED)||
    !["0","1"].includes(stream.RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED))
  deny("RISK_STREAM_RUNTIME_VAR_INVALID");
 const researchOn=stream.RISK_STREAM_ACTIVE==="1"&&
  stream.STREAM_INGESTION_ENABLED==="true"&&stream.STREAM_MODE==="PRODUCTION"&&
  stream.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED==="1";
 const anyResearchOn=stream.RISK_STREAM_ACTIVE==="1"||
  stream.STREAM_INGESTION_ENABLED==="true"||stream.STREAM_MODE==="PRODUCTION"||
  stream.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED==="1";
 if(anyResearchOn&&!researchOn)deny("RISK_STREAM_RESEARCH_FLAGS_INCOMPLETE");
 if(["GEOMACRO_COMMERCIAL_STREAM_RELEASE","RISK_STREAM_CANARY_HOLD_CLEARED",
     "RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED"].some(name=>
       predgeRuntimeVars[name]!==undefined&&predgeRuntimeVars[name]!=="0"))
  deny("CANARY_NO_FUNDS_CANNOT_ENABLE_COMMERCIAL_RELEASE");
 const reviewerService=predgeRuntimeVars.GEOMACRO_RELEASE_REVIEWER_SERVICE??"";
 if(typeof reviewerService!=="string"||reviewerService!==""&&
    !/^[A-Za-z0-9_-]{1,63}$/u.test(reviewerService))
  deny("GEOMACRO_RELEASE_REVIEWER_SERVICE_INVALID");
 const paid=predgeRuntimeVars.PREDGE_PAID_TRAFFIC_ENABLED??PREDGE_TRIAL_VARS.PREDGE_PAID_TRAFFIC_ENABLED;
 const crosscheck=predgeRuntimeVars.PREDGE_PAID_GO_LIVE_CROSSCHECK??PREDGE_TRIAL_VARS.PREDGE_PAID_GO_LIVE_CROSSCHECK;
 const trialStart=predgeRuntimeVars.PREDGE_MUTUAL_TRIAL_STARTED_AT??PREDGE_TRIAL_VARS.PREDGE_MUTUAL_TRIAL_STARTED_AT;
 const storeCheckout=predgeRuntimeVars.GEOMACRO_STORE_CHECKOUT_ENABLED??"";
 if(!["YES","NO"].includes(paid)||!["","PASS"].includes(crosscheck)||
    typeof trialStart!=="string"||trialStart!==""&&
    (!TRIAL_START.test(trialStart)||!Number.isFinite(Date.parse(trialStart))))
  deny("PREDGE_TRIAL_RUNTIME_VAR_INVALID");
 if(storeCheckout!==""&&!["YES","NO"].includes(storeCheckout))deny("STORE_CHECKOUT_RUNTIME_VAR_INVALID");
 return {...REVIEWED_HOT50_RUNTIME_VARS,...stream,GEOMACRO_SOURCE_SHA:sha,
  PREDGE_PAID_TRAFFIC_ENABLED:paid,
  PREDGE_PAID_GO_LIVE_CROSSCHECK:crosscheck,
  PREDGE_MUTUAL_TRIAL_STARTED_AT:trialStart,
  ...(storeCheckout?{GEOMACRO_STORE_CHECKOUT_ENABLED:storeCheckout}:{})};
}
const bindingText=row=>typeof row?.text==="string"?row.text:
 typeof row?.value==="string"?row.value:null;
const canonical=x=>JSON.stringify(x,(_,v)=>
 v&&typeof v==="object"&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
// Caller must explicitly provide the reviewed source-controlled secret names when
// these are newly introduced. A version with hidden/unknown text is a HOLD.
/**
 * Read-only diagnostic of provider binding names and TYPES, never credential
 * values, tokens, binding IDs, plain-text values, or unreviewed flag contents.
 * The strict gate below still rejects anything not already approved.
 */
export function diagnoseReviewedHot50BindingDelta(base,candidate,sha,reviewedSecrets=[],runtimeVars={}){
 const a=bindingInventory(base),b=bindingInventory(candidate);
 const desired=reviewedHot50CandidateVars(sha,runtimeVars);
 const desiredNew=[...Object.keys(desired).filter(name=>!a.has(name)),
  ...reviewedSecrets.filter(name=>!a.has(name))];
 const expected=new Set(desiredNew);
 const safe=name=>/^[A-Z_][A-Z0-9_]{0,100}$/u.test(name)?name:"REDACTED_INVALID_BINDING_NAME";
 const addition=[...b.keys()].filter(name=>!a.has(name)).sort();
 const removed=[...a.keys()].filter(name=>!b.has(name)).sort();
 const unexpected=addition.filter(name=>!expected.has(name));
 const missing=desiredNew.filter(name=>!b.has(name));
 const wronglyTyped=[...b.keys()].filter(name=>a.has(name)&&a.get(name)!==b.get(name));
 return Object.freeze({
  schema:"geomacro.protected-worker-binding-delta.v1",
  status:unexpected.length||missing.length||removed.length||wronglyTyped.length?
   "UNREVIEWED_BINDING_DELTA_HOLD":"NO_UNEXPECTED_BINDING_NAMES",
  actual_additions:addition.map(name=>({name:safe(name),type:b.get(name)})),
  expected_additions:[...expected].sort().map(safe),
  unexpected_addition_names:unexpected.map(safe),
  expected_additions_missing:missing.map(safe),
  removed_binding_names:removed.map(safe),
  changed_binding_type_names:wronglyTyped.map(safe),
  baseline_binding_count:a.size,candidate_binding_count:b.size,
  secret_values_included:false,plain_text_values_included:false,
  secret_metadata_included:false,traffic_promoted:false,payments:0
 });
}
export function assessReviewedHot50BindingParity(base,candidate,sha,reviewedSecrets=[],predgeRuntimeVars={}){
 const required=reviewedHot50CandidateVars(sha,predgeRuntimeVars);
 const a=bindingInventory(base),b=bindingInventory(candidate);
 if(!Array.isArray(reviewedSecrets)||reviewedSecrets.length!==new Set(reviewedSecrets).size||
    reviewedSecrets.some(n=>!REVIEWABLE_ADDITIVE_SECRETS.includes(n)))
  deny("UNREVIEWED_SECRET_NAME");
 const rowsA=base.resources.bindings,rowsB=candidate.resources.bindings;
 if(!Array.isArray(rowsA)||!Array.isArray(rowsB))deny("UNREADABLE");
 const old=new Map(rowsA.map(x=>[x.name,x]));
 const current=new Map(rowsB.map(x=>[x.name,x]));
 const reviewerService=predgeRuntimeVars.GEOMACRO_RELEASE_REVIEWER_SERVICE??"";
 // Existing secret bindings MUST be preserved, not silently rotated by
 // a newly uploaded secrets file. Only actually missing names may be reviewed.
 for(const name of reviewedSecrets)
  if(a.has(name))deny("REVIEWED_SECRET_ALREADY_EXISTS_"+name);
 for(const [name,type] of a){
  if(b.get(name)!==type)deny("REMOVAL_OR_TYPE_CHANGE_"+name);
  const before=old.get(name),after=current.get(name);
  if(Object.hasOwn(required,name)){
   // Only the reviewed plain-text value may change; resource metadata cannot.
   if(type!=="plain_text")deny("REVIEWED_FLAG_TYPE_CHANGED_"+name);
   const stripped=row=>{
    const copy={...row};delete copy.text;delete copy.value;return copy;
   };
   if(canonical(stripped(before))!==canonical(stripped(after)))
    deny("REVIEWED_FLAG_RESOURCE_CHANGED_"+name);
  }else if(canonical(before)!==canonical(after))
   deny("UNREVIEWED_RESOURCE_CHANGE_"+name);
 }
 for(const [name,wanted] of Object.entries(required)){
  const row=current.get(name);
  if(row?.type!=="plain_text"||bindingText(row)!==wanted)
   deny("REVIEWED_FLAG_NOT_VERIFIED_"+name);
 }
 const reviewerBinding=current.get("GEOMACRO_RELEASE_REVIEWER");
 const reviewerWasPresent=a.has("GEOMACRO_RELEASE_REVIEWER");
 if(reviewerService){
  if(reviewerBinding?.type!=="service"||reviewerBinding.service!==reviewerService||
     Object.keys(reviewerBinding).some(k=>!["name","type","service"].includes(k)))
   deny("GEOMACRO_RELEASE_REVIEWER_BINDING_MISMATCH");
 }else if(!reviewerWasPresent&&reviewerBinding)
  deny("GEOMACRO_RELEASE_REVIEWER_BINDING_UNREVIEWED");
 const additions=[...b.keys()].filter(n=>!a.has(n)).sort();
 const expected=[...Object.keys(required).filter(n=>!a.has(n)),
   ...reviewedSecrets.filter(n=>!a.has(n)),
   ...(reviewerService&&!reviewerWasPresent?["GEOMACRO_RELEASE_REVIEWER"]:[])].sort();
 if(canonical(additions)!==canonical(expected))deny("UNREVIEWED_ADDITION");
 for(const name of reviewedSecrets){
  const row=current.get(name);
  if(row?.type!=="secret_text"||
     Object.keys(row).some(k=>!["name","type"].includes(k)))
   deny("REVIEWED_SECRET_TYPE_OR_METADATA_"+name);
 }
 // Hidden secret values are never logged. A pre-existing secret cannot be
 // proven identical by a binding-name check; type and presence only are asserted.
 return Object.freeze({status:"PASS_REVIEWED_HOT50_PARITY",additions,
  reviewed_secret_names:[...reviewedSecrets].sort(),
  baseline_count:a.size,candidate_count:b.size,source_sha:sha});
}
