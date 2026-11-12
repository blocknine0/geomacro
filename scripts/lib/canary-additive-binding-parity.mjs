/** Fail-closed, value-aware Worker parity for exact-main zero-funds Hot50 intake.
 * A review covers only explicitly named secret additions and ONE fixed flag profile.
 */
export const REVIEWABLE_ADDITIVE_SECRETS=Object.freeze([
 "GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",
 "GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64",
 "GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64",
 "RISK_STREAM_INDEX_LEAD_BEARER"
]);
export const HOT50_INTAKE_PROFILE="HOT50_INTAKE_REVIEWED";
export const HOT50_INTAKE_VARS=Object.freeze({
 RISK_GATE_COUNTRY_SCOPE:"HOT50",
 RISK_STREAM_ACTIVE:"1",
 STREAM_INGESTION_ENABLED:"true",
 RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1"
});
export const FAIL_CLOSED_RELEASE_VARS=Object.freeze({
 GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
 RISK_STREAM_CANARY_HOLD_CLEARED:"0",
 RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"0"
});
const SHA=/^[a-f0-9]{40}$/;
const deny=code=>{throw Error("CANARY_BINDINGS_"+code)};
const canonical=value=>JSON.stringify(value,(_,v)=>
 v&&typeof v==="object"&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function bindingRows(version){
 const raw=version?.resources?.bindings;
 if(!raw||typeof raw!=="object")deny("UNAVAILABLE");
 const rows=Array.isArray(raw)?raw:Object.entries(raw).flatMap(([type,values])=>
  Array.isArray(values)?values.map(v=>({...v,type:v.type??type})):
  values&&typeof values==="object"&&values.name?
   [{...values,type:values.type??type}]:[]);
 if(!rows.length)deny("EMPTY");
 const map=new Map();
 for(const row of rows){
  if(typeof row?.name!=="string"||!row.name||
     typeof row?.type!=="string"||!row.type||map.has(row.name))
   deny("INVALID_OR_DUPLICATE");
  map.set(row.name,row);
 }
 return map;
}
export function bindingInventory(version){
 return new Map([...bindingRows(version)].map(([name,row])=>[name,row.type]));
}
export function plainTextValue(row){
 if(row?.type!=="plain_text")return null;
 return typeof row.text==="string"?row.text:
  typeof row.value==="string"?row.value:null;
}
export function parseReviewedAdditiveSecretNames(raw=""){
 if(typeof raw!=="string"||raw!==raw.trim())deny("REVIEWED_NAME_INPUT_INVALID");
 if(raw==="")return [];
 const names=raw.split(",");
 if(names.length>REVIEWABLE_ADDITIVE_SECRETS.length||
    names.some(name=>!name||name!==name.trim()||
     !REVIEWABLE_ADDITIVE_SECRETS.includes(name))||
    new Set(names).size!==names.length)
  deny("REVIEWED_NAME_INPUT_INVALID");
 return names.sort();
}
export function assessReviewedAdditiveBindingParity(base,candidate,options=[]){
 // Keep compatibility with original pure tests accepting a names array.
 const opts=Array.isArray(options)?{reviewedSecretNames:options}:options??{};
 const reviewed=opts.reviewedSecretNames??[];
 const profile=opts.reviewedFlagProfile??"";
 const sha=opts.sourceSha??null;
 if(!Array.isArray(reviewed)||reviewed.some(x=>
  typeof x!=="string"||!REVIEWABLE_ADDITIVE_SECRETS.includes(x))||
  new Set(reviewed).size!==reviewed.length)deny("REVIEWED_NAME_INVALID_OR_DUPLICATE");
 if(profile!==""&&profile!==HOT50_INTAKE_PROFILE)deny("FLAG_PROFILE_UNREVIEWED");
 if(sha!==null&&!SHA.test(sha))deny("SOURCE_SHA_INVALID");
 const a=bindingRows(base),b=bindingRows(candidate);
 const allowedFlags=profile===HOT50_INTAKE_PROFILE?HOT50_INTAKE_VARS:{};
 const sourceChanged=(row)=>row?.name==="GEOMACRO_SOURCE_SHA"&&sha!==null;
 const expectedValue=name=>Object.hasOwn(allowedFlags,name)?allowedFlags[name]:
  Object.hasOwn(FAIL_CLOSED_RELEASE_VARS,name)?FAIL_CLOSED_RELEASE_VARS[name]:
  name==="GEOMACRO_SOURCE_SHA"?sha:null;
 const changes=[];
 for(const [name,before] of a){
  const after=b.get(name);
  if(!after||before.type!==after.type)deny("REMOVAL_OR_TYPE_CHANGE_"+name);
  const expected=expectedValue(name);
  if(Object.hasOwn(FAIL_CLOSED_RELEASE_VARS,name)&&
     plainTextValue(before)!=="0")deny("BASELINE_RELEASE_GATE_NOT_CLOSED_"+name);
  if(expected!==null&&(Object.hasOwn(allowedFlags,name)||
      Object.hasOwn(FAIL_CLOSED_RELEASE_VARS,name)||sourceChanged(before))){
   if(before.type!=="plain_text"||plainTextValue(after)!==expected)
    deny("REVIEWED_VAR_VALUE_OR_TYPE_"+name);
   // Only the plain-text value may change; no resource metadata bypass.
   const clone={...before};
   if(Object.hasOwn(clone,"text"))clone.text=expected;
   else if(Object.hasOwn(clone,"value"))clone.value=expected;
   else deny("BASELINE_PLAIN_TEXT_UNREADABLE_"+name);
   if(canonical(clone)!==canonical(after))deny("RESOURCE_METADATA_CHANGED_"+name);
   if(plainTextValue(before)!==expected)changes.push(name);
  }else if(canonical(before)!==canonical(after)){
   deny("UNREVIEWED_RESOURCE_OR_VALUE_CHANGE_"+name);
  }
 }
 const addedSecrets=[];
 const addedFlags=[];
 for(const [name,row] of b){
  if(a.has(name))continue;
  if(REVIEWABLE_ADDITIVE_SECRETS.includes(name)){
   if(row.type!=="secret_text"||!reviewed.includes(name))
    deny("UNREVIEWED_SECRET_ADDITION_"+name);
   addedSecrets.push(name);
  }else if(Object.hasOwn(allowedFlags,name)||
           Object.hasOwn(FAIL_CLOSED_RELEASE_VARS,name)||
           (name==="GEOMACRO_SOURCE_SHA"&&sha!==null)){
   const expected=expectedValue(name);
   if(row.type!=="plain_text"||plainTextValue(row)!==expected)
    deny("REVIEWED_VAR_VALUE_OR_TYPE_"+name);
   addedFlags.push(name);
  }else deny("UNREVIEWED_ADDITION_"+name);
 }
 const reviewedSorted=[...reviewed].sort();
 if(canonical(addedSecrets.sort())!==canonical(reviewedSorted))
  deny("REVIEWED_SECRET_SET_MISMATCH");
 if(sha!==null){
  if(plainTextValue(b.get("GEOMACRO_SOURCE_SHA"))!==sha)
   deny("EXACT_MAIN_SHA_UNVERIFIED");
  for(const [name,value] of Object.entries(FAIL_CLOSED_RELEASE_VARS))
   if(plainTextValue(b.get(name))!==value)deny("RELEASE_GATE_NOT_CLOSED_"+name);
 }
 if(profile===HOT50_INTAKE_PROFILE){
  for(const [name,value] of Object.entries(HOT50_INTAKE_VARS))
   if(plainTextValue(b.get(name))!==value)deny("HOT50_INTAKE_NOT_ENABLED_"+name);
 }
 for(const name of ["GEOMACRO_P0B_ADMISSION_ACTIVE","GEOMACRO_P1_BUNDLED_LEASES_ENABLED"])
  if(sha!==null&&plainTextValue(b.get(name))!=="1")
   deny("PROTECTED_RUNTIME_FLAG_NOT_ENABLED_"+name);
 return Object.freeze({status:"PASS_BINDING_PARITY",
  additions:addedSecrets,reviewed_flag_profile:profile,
  reviewed_flag_changes:changes.sort(),added_safe_vars:addedFlags.sort(),
  baseline_count:a.size,candidate_count:b.size});
}
