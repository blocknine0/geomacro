import {validateSourceRightsManifest} from "./risk-stream-source-rights-manifest.mjs";

export const COUNTRY_CATEGORIES=Object.freeze(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
export const REQUIRED_SOURCE_ROLES=Object.freeze({
 GEOPOLITICS:Object.freeze(["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"]),
 MACRO_FX:Object.freeze(["OFFICIAL_STATISTICS","MARKET_PRICE"]),
 CRITICAL_MINERALS:Object.freeze(["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"])
});
const CATEGORY_ALIASES=Object.freeze({geopolitics:"GEOPOLITICS",macro:"MACRO_FX",macro_fx:"MACRO_FX",
 rare_earth:"CRITICAL_MINERALS",critical_minerals:"CRITICAL_MINERALS"});
const fail=code=>{throw Error("COUNTRY_SOURCE_GAP_"+code)};
const iso3=x=>typeof x==="string"&&/^[A-Z]{3}$/u.test(x);
const safeHttps=value=>{
 if(typeof value!=="string"||value.length>2048)return false;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password}
 catch{return false}
};
const approvedEvidence=(entry,now)=>entry?.status==="APPROVED"&&
 typeof entry?.source_id==="string"&&/^[a-z0-9][a-z0-9_.:-]{2,119}$/u.test(entry.source_id)&&
 typeof entry?.publisher_root_domain==="string"&&/^[a-z0-9.-]{3,253}$/u.test(entry.publisher_root_domain)&&
 typeof entry?.parent_media_entity==="string"&&/^[a-z0-9_.:-]{1,100}$/u.test(entry.parent_media_entity)&&
 safeHttps(entry?.rights_evidence?.licence_url)&&safeHttps(entry?.rights_evidence?.terms_url)&&
 typeof entry?.rights_evidence?.reviewer==="string"&&entry.rights_evidence.reviewer.trim().length>=2&&
 typeof entry?.rights_evidence?.notes==="string"&&entry.rights_evidence.notes.trim().length>=12&&
 typeof entry?.rights_evidence?.reviewed_at==="string"&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(entry.rights_evidence.reviewed_at)&&
 Number.isFinite(Date.parse(entry.rights_evidence.reviewed_at))&&Date.parse(entry.rights_evidence.reviewed_at)<=now&&
 typeof entry?.rights_expire_at==="string"&&
 /^\d{4}-\d{2}-\d{2}$/u.test(entry.rights_expire_at)&&
 Number.isFinite(Date.parse(entry.rights_expire_at+"T23:59:59.999Z"))&&
 Date.parse(entry.rights_expire_at+"T23:59:59.999Z")>=now;

export function rolesForCategory(category){
 const normalized=CATEGORY_ALIASES[String(category??"").toLowerCase()]??String(category??"").toUpperCase();
 const roles=REQUIRED_SOURCE_ROLES[normalized];
 if(!roles)fail("CATEGORY_UNSUPPORTED");
 return [...roles];
}

export function classifyCandidateRights(candidate,rightsEntries=[],now=Date.now()){
 const category=CATEGORY_ALIASES[String(candidate?.category??candidate?.categories?.[0]??"").toLowerCase()]||
  String(candidate?.category??candidate?.categories?.[0]??"").toUpperCase();
 const required=REQUIRED_SOURCE_ROLES[category];
 const entry=rightsEntries.find(x=>x?.source_id===candidate?.source_id);
 const valid=Boolean(required&&entry&&approvedEvidence(entry,now)&&
  required.includes(entry.source_role)&&Array.isArray(entry.categories)&&
  entry.categories.includes(category));
 return {commercial_rights_approved:valid?1:0,
  lane:valid?"PRIMARY_COMMERCIAL_EVIDENCE":"PRIVATE_OSINT_REDACTED_CORROBORATION",
  raw_source_redacted:true,licensed_source_text_included:false,
  rights_status:valid?"EXACT_REVIEWED_ENTRY_CURRENT":"RIGHTS_NOT_EXACTLY_APPROVED"};
}

function normalizedCategory(value){return CATEGORY_ALIASES[String(value??"").toLowerCase()]??null;}
function freshHealthyProbe(probe,now,ttlMs){
 if(!probe||!["WORKING","NO_NEW_EVENT"].includes(probe.status)||probe.http_status!==200)return false;
 const checked=Date.parse(probe.last_successful_http_fetch_at??"");
 const published=Date.parse(probe.last_source_native_publication_at??"");
 return Number.isFinite(checked)&&checked<=now&&now-checked<=ttlMs&&
  Number.isFinite(published)&&published<=now+60000&&published>=Date.parse("1990-01-01T00:00:00Z");
}
function mapCandidate(c,category,rightsEntries,now,live){
 const classified=classifyCandidateRights({...c,category},rightsEntries,now);
 const entry=rightsEntries.find(x=>x.source_id===c.source_id);
 const identityMatches=Boolean(entry&&live&&live.publisher_root_domain===entry.publisher_root_domain&&
  live.parent_media_entity===entry.parent_media_entity&&live.source_role===entry.source_role&&
  live.reviewed_at===entry.rights_evidence.reviewed_at&&live.rights_expire_at===entry.rights_expire_at);
 return {source_id:c.source_id,format:c.format??null,url:c.url??null,
  country_specific:true,commercial_rights_approved:classified.commercial_rights_approved,
  lane:classified.lane,raw_source_redacted:classified.raw_source_redacted,
  licensed_source_text_included:classified.licensed_source_text_included,
  rights_status:classified.rights_status,
  source_role:entry?.source_role??null,registry_identity_matches_reviewed_entry:identityMatches};
}

export function buildCountrySourceGapReport({countries,hot50=[],sourceCatalog=[],riskStreamSources=[],
 probes=[],rightsEntries=[],now=Date.now(),healthTtlMs=24*60*60*1000}={}){
 if(!Array.isArray(countries)||countries.length!==195||
  new Set(countries.map(c=>c.iso3)).size!==195||countries.some(c=>!iso3(c.iso3)))
  fail("COUNTRY_UNIVERSE_INVALID");
 if(!Array.isArray(riskStreamSources)||!Array.isArray(sourceCatalog))fail("INPUT_SHAPE_INVALID");
 const hot=new Set(hot50);
 const registryById=new Map();
 for(const row of riskStreamSources){
  if(typeof row?.source_id==="string")registryById.set(row.source_id,row);
 }
 const probeById=new Map(probes.filter(p=>typeof p?.source_id==="string").map(p=>[p.source_id,p]));
 const cells=[],visited=new Set();
 for(const country of countries){
  for(const category of COUNTRY_CATEGORIES){
   visited.add(country.iso3+":"+category);
   const mappings=sourceCatalog.filter(s=>s.publisher_country_iso3===country.iso3&&
    Array.isArray(s.categories)&&s.categories.some(c=>normalizedCategory(c)===category));
   const activeHealthy=mappings.flatMap(s=>{
    const live=registryById.get(s.source_id), rights=classifyCandidateRights({...s,category},rightsEntries,now);
    const entry=rightsEntries.find(x=>x.source_id===s.source_id);
    const healthy=live?.enabled===1&&live?.commercial_rights_approved===1&&
     rights.commercial_rights_approved===1&&entry&&
     live.publisher_root_domain===entry.publisher_root_domain&&
     live.parent_media_entity===entry.parent_media_entity&&live.source_role===entry.source_role&&
     live.reviewed_at===entry.rights_evidence.reviewed_at&&live.rights_expire_at===entry.rights_expire_at&&
     freshHealthyProbe(probeById.get(s.source_id),now,healthTtlMs);
    return healthy?[{source:s,entry}]:[];
   });
   const requiredRoles=REQUIRED_SOURCE_ROLES[category];
   const completeRolePair=requiredRoles.some(roleA=>requiredRoles.some(roleB=>roleA!==roleB&&
    activeHealthy.some(a=>activeHealthy.some(b=>
     a.entry.source_role===roleA&&b.entry.source_role===roleB&&
     a.entry.publisher_root_domain!==b.entry.publisher_root_domain&&
     a.entry.parent_media_entity!==b.entry.parent_media_entity))));
   if(completeRolePair)continue;
   const candidateSources=mappings.map(s=>{
    const live=registryById.get(s.source_id),probe=probeById.get(s.source_id);
    return {...mapCandidate(s,category,rightsEntries,now,live),
     active_in_risk_stream:live?.enabled===1&&live?.commercial_rights_approved===1,
     health_status:freshHealthyProbe(probe,now,healthTtlMs)?"HEALTHY":
      probe?.status??"NOT_PROBED_OR_STALE"};
   });
   const reasons=[];
   if(mappings.length>0)reasons.push("NO_COMPLETE_INDEPENDENT_ACTIVE_ROLE_PAIR");
   if(mappings.length===0)reasons.push("NO_COUNTRY_SPECIFIC_CATALOG_CANDIDATE");
   if(mappings.length>0&&!mappings.some(s=>registryById.get(s.source_id)?.enabled===1))
    reasons.push("NO_ENABLED_RISK_STREAM_SOURCE");
   if(mappings.some(s=>registryById.get(s.source_id)?.enabled===1&&
      registryById.get(s.source_id)?.commercial_rights_approved!==1))
    reasons.push("RIGHTS_NOT_APPROVED_IN_RISK_STREAM");
   if(mappings.some(s=>{
    const row=registryById.get(s.source_id),entry=rightsEntries.find(x=>x.source_id===s.source_id);
    return row?.enabled===1&&entry&&(row.publisher_root_domain!==entry.publisher_root_domain||
     row.parent_media_entity!==entry.parent_media_entity||row.source_role!==entry.source_role||
     row.reviewed_at!==entry.rights_evidence.reviewed_at||row.rights_expire_at!==entry.rights_expire_at);
   }))reasons.push("RIGHTS_REGISTRY_IDENTITY_MISMATCH");
   if(mappings.some(s=>registryById.get(s.source_id)?.enabled===1&&
      !freshHealthyProbe(probeById.get(s.source_id),now,healthTtlMs)))
    reasons.push("LIVE_HEALTH_UNVERIFIED_OR_STALE");
   cells.push({country_iso3:country.iso3,country_name:country.name??null,category,
    priority:hot.has(country.iso3)?"HOT50":"COUNTRY_195",
    required_source_roles:rolesForCategory(category),gap_reasons:reasons,
    candidate_sources:candidateSources});
  }
 }
 cells.sort((a,b)=>(a.priority==="HOT50"?0:1)-(b.priority==="HOT50"?0:1)||
  a.country_iso3.localeCompare(b.country_iso3)||a.category.localeCompare(b.category));
 if(visited.size!==585||cells.length>585||
  new Set(cells.map(x=>x.country_iso3+":"+x.category)).size!==cells.length)
  fail("CELL_COUNT_INVALID");
 return {schema:"geomacro.country-source-gap-report.v1",generated_at:new Date(now).toISOString(),
  country_count:195,category_count:3,cell_count:585,gap_count:cells.length,
  hot50_gap_count:cells.filter(c=>c.priority==="HOT50").length,
  hot50_countries:hot50.length,rights_policy:"HTTP_SUCCESS_NEVER_GRANTS_COMMERCIAL_RIGHTS",
  healthy_source_rule:"country-specific + enabled + exact current rights approval + fresh HTTP 200 parsed native-date probe",
  risk_stream_source_rows_seen:riskStreamSources.length,
  rights_manifest_approved_entries:rightsEntries.filter(x=>x.status==="APPROVED").length,
  rights_manifest_pending_entries:rightsEntries.filter(x=>x.status==="PENDING").length,cells};
}

export function buildApprovedRegistryUpserts(manifest,now=Date.now()){
 const {approvedEntries}=validateSourceRightsManifest(manifest,now);
 return approvedEntries.map(entry=>{
  const values=[entry.source_id,entry.publisher_root_domain,entry.parent_media_entity,
   entry.source_role,1,1,entry.rights_evidence.reviewed_at,entry.rights_expire_at]
   .map(v=>typeof v==="number"?String(v):"'"+String(v).replaceAll("'","''")+"'").join(",");
  return "INSERT INTO risk_stream_sources (source_id,publisher_root_domain,parent_media_entity,source_role,commercial_rights_approved,enabled,reviewed_at,rights_expire_at) VALUES ("+values+") ON CONFLICT(source_id) DO UPDATE SET publisher_root_domain=excluded.publisher_root_domain,parent_media_entity=excluded.parent_media_entity,source_role=excluded.source_role,commercial_rights_approved=1,enabled=1,reviewed_at=excluded.reviewed_at,rights_expire_at=excluded.rights_expire_at;";
 });
}

export function buildHealthyApprovedSourceManifest(manifest,report,now=Date.now()){
 const current=now instanceof Date?now.getTime():now;
 const {approvedEntries}=validateSourceRightsManifest(manifest,current);
 if(report?.schema!=="geomacro.country-source-gap-report.v1"||report.cell_count!==585||
  !Array.isArray(report.cells))fail("LIVE_HEALTH_REPORT_INVALID");
 const generated=Date.parse(report.generated_at??"");
 if(!Number.isFinite(generated)||generated>current||current-generated>30*60_000)
  fail("LIVE_HEALTH_REPORT_STALE");
 const candidates=new Map();
 for(const cell of report.cells)for(const candidate of cell.candidate_sources??[]){
  if(candidate?.source_id&&candidate.country_specific===true&&
   candidate.commercial_rights_approved===1&&candidate.lane==="PRIMARY_COMMERCIAL_EVIDENCE"&&
   candidate.health_status==="HEALTHY"){
   const category=cell.category,roles=REQUIRED_SOURCE_ROLES[category];
   if(roles?.includes(candidate.source_role))candidates.set(candidate.source_id,{candidate,category});
  }
 }
 const probes=new Map((report.probes_this_run??report.probes??[]).map(p=>[p.source_id,p]));
 const entries=approvedEntries.filter(entry=>{
  const match=candidates.get(entry.source_id),probe=probes.get(entry.source_id);
  if(!match||!entry.categories.includes(match.category)||entry.source_role!==match.candidate.source_role)return false;
  if(!probe||!["WORKING","NO_NEW_EVENT"].includes(probe.status)||probe.http_status!==200)return false;
  const fetched=Date.parse(probe.last_successful_http_fetch_at??"");
  const published=Date.parse(probe.last_source_native_publication_at??"");
  return Number.isFinite(fetched)&&fetched<=current&&current-fetched<=24*60*60_000&&
   Number.isFinite(published)&&published<=current+60_000&&
   published>=Date.parse("1990-01-01T00:00:00Z");
 });
 return {schema:manifest.schema,entries,approved_entries_selected:entries.length,
  approved_entries_omitted:approvedEntries.length-entries.length,
  health_proof_required:true,rights_status_changed:false};
}
