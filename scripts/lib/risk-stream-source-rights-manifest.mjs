const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const PARENT=/^[a-z0-9_.:-]+$/u;
const ROLES=new Set(["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL",
 "OFFICIAL_STATISTICS","MARKET_PRICE","TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]);
export const RISK_STREAM_CATEGORY_ROLES=Object.freeze({
 GEOPOLITICS:Object.freeze(["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"]),
 MACRO_FX:Object.freeze(["OFFICIAL_STATISTICS","MARKET_PRICE"]),
 CRITICAL_MINERALS:Object.freeze(["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"])
});
const ENTRY_KEYS=["source_id","publisher_root_domain","parent_media_entity",
 "source_role","categories","status","rights_evidence","rights_expire_at"];
const EVIDENCE_KEYS=["licence_url","terms_url","reviewed_at","reviewer","notes"];
const fail=code=>{throw Error("RISK_STREAM_SOURCE_RIGHTS_"+code)};
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|");
const isIsoDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value+"T00:00:00.000Z").toISOString().slice(0,10)===value;
const isIsoDateTime=value=>typeof value==="string"&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)&&
 Number.isFinite(Date.parse(value));
const validHttpsUrl=value=>{
 if(typeof value!=="string"||value.length>2048)return false;
 try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password}
 catch{return false}
};
function nowMs(now){
 const value=now instanceof Date?now.getTime():typeof now==="number"?now:Date.parse(now);
 if(!Number.isFinite(value))fail("VALIDATION_CLOCK_INVALID");
 return value;
}
function validateEntry(entry,ids,current){
 if(!exact(entry,ENTRY_KEYS))fail("ENTRY_SCHEMA_INVALID");
 if(typeof entry.source_id!=="string"||!SOURCE.test(entry.source_id))
  fail("SOURCE_ID_INVALID");
 if(ids.has(entry.source_id))fail("SOURCE_ID_DUPLICATE");
 ids.add(entry.source_id);
 if(typeof entry.publisher_root_domain!=="string"||!DOMAIN.test(entry.publisher_root_domain))
  fail("PUBLISHER_DOMAIN_INVALID");
 if(typeof entry.parent_media_entity!=="string"||entry.parent_media_entity.length>100||
    !PARENT.test(entry.parent_media_entity))fail("PARENT_ENTITY_INVALID");
 if(!ROLES.has(entry.source_role))fail("SOURCE_ROLE_INVALID");
 if(!Array.isArray(entry.categories)||entry.categories.length<1||
    new Set(entry.categories).size!==entry.categories.length||
    entry.categories.some(category=>!Object.hasOwn(RISK_STREAM_CATEGORY_ROLES,category)||
     !RISK_STREAM_CATEGORY_ROLES[category].includes(entry.source_role)))
  fail("CATEGORIES_INVALID");
 if(entry.status!=="PENDING"&&entry.status!=="APPROVED")fail("STATUS_INVALID");
 const evidence=entry.rights_evidence;
 if(!exact(evidence,EVIDENCE_KEYS)||typeof evidence.notes!=="string"||
    evidence.notes.trim().length<1)fail("RIGHTS_EVIDENCE_SCHEMA_INVALID");
 if(entry.status==="PENDING"){
  if(entry.rights_expire_at!==null)fail("PENDING_EXPIRY_MUST_BE_NULL");
  for(const key of EVIDENCE_KEYS.slice(0,4))
   if(evidence[key]!==null&&typeof evidence[key]!=="string")
    fail("PENDING_EVIDENCE_FIELD_INVALID");
  return;
 }
 if(!isIsoDate(entry.rights_expire_at)||Date.parse(entry.rights_expire_at+"T00:00:00.000Z")<=current)
  fail("APPROVED_RIGHTS_EXPIRED_OR_INVALID");
 if(!validHttpsUrl(evidence.licence_url)||!validHttpsUrl(evidence.terms_url)||
    !isIsoDateTime(evidence.reviewed_at)||typeof evidence.reviewer!=="string"||
    evidence.reviewer.trim().length<2||evidence.reviewer.trim().length>160||
    evidence.notes.trim().length<12)fail("APPROVED_EVIDENCE_INCOMPLETE");
}
function validateIndependentRolePairs(entries){
 for(const [category,[roleA,roleB]] of Object.entries(RISK_STREAM_CATEGORY_ROLES)){
  const roleAEntries=entries.filter(x=>x.status==="APPROVED"&&
   x.categories.includes(category)&&x.source_role===roleA);
  const roleBEntries=entries.filter(x=>x.status==="APPROVED"&&
   x.categories.includes(category)&&x.source_role===roleB);
  if(!roleAEntries.length||!roleBEntries.length)continue;
  const independent=roleAEntries.some(a=>roleBEntries.some(b=>
   a.publisher_root_domain!==b.publisher_root_domain&&
   a.parent_media_entity!==b.parent_media_entity));
  if(!independent)fail("ROLE_PAIR_NOT_INDEPENDENT_"+category);
 }
}
export function validateSourceRightsManifest(manifest,now=Date.now()){
 if(!manifest||manifest.schema!=="geomacro.risk-stream-source-rights-reviewed.v1"||
    !Array.isArray(manifest.entries))fail("MANIFEST_SCHEMA_INVALID");
 const current=nowMs(now),ids=new Set();
 for(const entry of manifest.entries)validateEntry(entry,ids,current);
 validateIndependentRolePairs(manifest.entries);
 return {
  approvedEntries:manifest.entries.filter(x=>x.status==="APPROVED"),
  pendingEntries:manifest.entries.filter(x=>x.status==="PENDING")
 };
}
