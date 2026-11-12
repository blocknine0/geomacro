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
