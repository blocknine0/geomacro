/** Exact Cloudflare Worker binding parity with separately reviewed additive secrets. */
export const REVIEWABLE_ADDITIVE_SECRETS=Object.freeze([
  "GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",
  "GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64",
  "GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64",
  "RISK_STREAM_INDEX_LEAD_BEARER"
]);
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
 RISK_STREAM_ACTIVE:"1",
 STREAM_INGESTION_ENABLED:"true",
 RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1",
 GEOMACRO_COMMERCIAL_STREAM_RELEASE:"0",
 RISK_STREAM_CANARY_HOLD_CLEARED:"0",
 RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"0"
});
export function reviewedHot50CandidateVars(sha){
 if(!/^[a-f0-9]{40}$/.test(sha))deny("SOURCE_SHA_INVALID");
 return {...REVIEWED_HOT50_RUNTIME_VARS,GEOMACRO_SOURCE_SHA:sha};
}
const bindingText=row=>typeof row?.text==="string"?row.text:
 typeof row?.value==="string"?row.value:null;
const canonical=x=>JSON.stringify(x,(_,v)=>
 v&&typeof v==="object"&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
// Caller must explicitly provide the four source-controlled secret names when
// these are newly introduced. A version with hidden/unknown text is a HOLD.
export function assessReviewedHot50BindingParity(base,candidate,sha,reviewedSecrets=[]){
 const required=reviewedHot50CandidateVars(sha);
 const a=bindingInventory(base),b=bindingInventory(candidate);
 if(!Array.isArray(reviewedSecrets)||reviewedSecrets.length!==new Set(reviewedSecrets).size||
    reviewedSecrets.some(n=>!REVIEWABLE_ADDITIVE_SECRETS.includes(n)))
  deny("UNREVIEWED_SECRET_NAME");
 const rowsA=base.resources.bindings,rowsB=candidate.resources.bindings;
 if(!Array.isArray(rowsA)||!Array.isArray(rowsB))deny("UNREADABLE");
 const old=new Map(rowsA.map(x=>[x.name,x]));
 const current=new Map(rowsB.map(x=>[x.name,x]));
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
 const additions=[...b.keys()].filter(n=>!a.has(n)).sort();
 const expected=[...Object.keys(required).filter(n=>!a.has(n)),
   ...reviewedSecrets.filter(n=>!a.has(n))].sort();
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
