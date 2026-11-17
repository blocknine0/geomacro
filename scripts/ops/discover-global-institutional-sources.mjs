#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {probeSource} from "./phase2i-coverage-inventory.mjs";
import {validateSourceRightsManifest,RISK_STREAM_CATEGORY_ROLES} from "../lib/risk-stream-source-rights-manifest.mjs";
import {
 GLOBAL_RISK_QUERY_TAXONOMY_VERSION,
 selectGlobalRiskQueryBucket
} from "../lib/global-risk-query-taxonomy.mjs";

const fail=code=>{throw Error("GLOBAL_INSTITUTIONAL_SOURCE_"+code)};
const readJson=path=>JSON.parse(readFileSync(path,"utf8"));
const sourceManifestPath="config/risk-stream-source-rights-reviewed.v1.json";
const candidatesPath="config/global-institutional-source-candidates.v1.json";
const nowIso=now=>now.toISOString();
const nativeTimestamp=value=>typeof value==="string"&&
 /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(value)&&Number.isFinite(Date.parse(value));
function parseArgs(argv){
 const out={probe:false,probeLimit:24,now:new Date(),output:null,eligibleManifest:null};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==="--probe"){out.probe=true;continue;}
  if(arg==="--probe-limit"){const n=Number(argv[++i]);if(!Number.isInteger(n)||n<1||n>24)fail("PROBE_LIMIT_INVALID");out.probeLimit=n;continue;}
  if(arg==="--out"){out.output=argv[++i];if(!out.output)fail("OUTPUT_PATH_REQUIRED");continue;}
  if(arg==="--eligible-manifest"){out.eligibleManifest=argv[++i];if(!out.eligibleManifest)fail("MANIFEST_OUTPUT_REQUIRED");continue;}
  fail("ARGUMENTS_INVALID");
 }
 if(!out.output)fail("OUTPUT_REQUIRED");
 return out;
}
function explicitRights(candidate,entries,now){
 const entry=entries.find(x=>x.source_id===candidate.source_id);
 const roles=RISK_STREAM_CATEGORY_ROLES[candidate.category]??[];
 const exact=Boolean(entry&&entry.status==="APPROVED"&&
  entry.publisher_root_domain===candidate.publisher_root_domain&&
  entry.parent_media_entity===candidate.parent_media_entity&&
  entry.source_role===candidate.source_role&&entry.categories.includes(candidate.category)&&
  roles.includes(entry.source_role)&&entry.rights_expire_at&&
  Date.parse(entry.rights_expire_at+"T23:59:59.999Z")>=now.getTime()&&
  /^https:\/\//u.test(entry.rights_evidence?.licence_url??"")&&
  /^https:\/\//u.test(entry.rights_evidence?.terms_url??""));
 return {commercial_rights_approved:exact?1:0,
  lane:exact?"PRIMARY_COMMERCIAL_EVIDENCE":"PRIVATE_OSINT_REDACTED_CORROBORATION",
  raw_source_redacted:true,licensed_source_text_included:false,
  rights_status:exact?"EXACT_CURRENT_REVIEWED_ENTRY":"RIGHTS_NOT_EXACTLY_APPROVED"};
}
async function probeJson(candidate,{fetchImpl=fetch,now=new Date()}={}){
 const base={source_id:candidate.source_id,attempted_at:nowIso(now),status:"NOT_YET_VERIFIED",
  http_status:null,last_successful_http_fetch_at:null,last_source_native_publication_at:null,
  observed_feed_items:0,recent_native_dated_items:0,failure_reason:null};
 try{
  const response=await fetchImpl(candidate.url,{method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json","User-Agent":"GeoMacro-Global-Source-Audit/1.0 (+https://geomacro.live)"},
   signal:AbortSignal.timeout(9000)});
  if(response.status!==200)return {...base,http_status:response.status,status:"SOURCE_UNAVAILABLE",
   failure_reason:response.status===429?"SOURCE_HTTP_429":"SOURCE_HTTP_NON_200"};
  if(!String(response.headers.get("content-type")??"").toLowerCase().includes("json"))
   return {...base,http_status:200,status:"UNSUPPORTED_FORMAT",failure_reason:"JSON_CONTENT_TYPE_REQUIRED"};
  const reader=response.body?.getReader();if(!reader)return {...base,http_status:200,status:"UNSUPPORTED_FORMAT",
   failure_reason:"BODY_MISSING"};
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>192*1024)throw Error("SIZE_LIMIT");chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const body=JSON.parse(new TextDecoder().decode(bytes));
  const records=Array.isArray(body?.data)?body.data:[];
  if(records.length>1000)throw Error("SHAPE_LIMIT");
  const dates=records.map(x=>x?.fields?.date?.created).filter(nativeTimestamp)
   .map(Date.parse).filter(ms=>ms<=now.getTime()+60000&&ms>=Date.parse("1990-01-01T00:00:00Z"));
  const last=dates.length?new Date(Math.max(...dates)).toISOString():null;
  const recent=dates.filter(ms=>now.getTime()-ms<=25*3600000).length;
  return {...base,http_status:200,last_successful_http_fetch_at:nowIso(now),
   last_source_native_publication_at:last,observed_feed_items:records.length,
   recent_native_dated_items:recent,status:recent?"WORKING":"NO_NEW_EVENT",
   failure_reason:dates.length?null:"NATIVE_PUBLICATION_CLOCK_MISSING"};
 }catch(error){
  return {...base,status:"UNSUPPORTED_FORMAT",failure_reason:
   String(error?.message)==="SIZE_LIMIT"?"BODY_OVER_192KB":
   String(error?.message)==="SHAPE_LIMIT"?"JSON_SHAPE_LIMIT":"JSON_PARSE_OR_NETWORK_FAILURE"};
 }
}
export async function probeInstitutionalCandidate(candidate,{fetchImpl=fetch,now=new Date()}={}){
 if(!candidate||typeof candidate.source_id!=="string"||!/^https:\/\//u.test(candidate.url??""))
  fail("CANDIDATE_INVALID");
 const result=candidate.format==="json_reliefweb"?
  await probeJson(candidate,{fetchImpl,now}):
  await probeSource({source_id:candidate.source_id,url:candidate.url,format:candidate.format},
   {fetchImpl,now});
 return {source_id:candidate.source_id,category:candidate.category,source_role:candidate.source_role,
  publisher_root_domain:candidate.publisher_root_domain,parent_media_entity:candidate.parent_media_entity,
  pillar:candidate.pillar,format:candidate.format,health_status:result.status,
  http_status:result.http_status,last_successful_http_fetch_at:result.last_successful_http_fetch_at,
  last_source_native_publication_at:result.last_source_native_publication_at,
  failure_reason:result.failure_reason??null};
}
export function buildInstitutionalSourceReport({candidates,rightsEntries,probes,now=new Date()}={}){
 if(!Array.isArray(candidates)||!Array.isArray(rightsEntries)||!Array.isArray(probes))
  fail("INPUT_INVALID");
 for(const candidate of candidates){
  const roles=RISK_STREAM_CATEGORY_ROLES[candidate?.category];
  if(!candidate||typeof candidate.source_id!=="string"||!roles?.includes(candidate.source_role)||
     typeof candidate.publisher_root_domain!=="string"||typeof candidate.parent_media_entity!=="string"||
     !["rss","atom","rdf","xml","json_reliefweb"].includes(candidate.format))
   fail("CANDIDATE_ROLE_OR_IDENTITY_INVALID");
 }
 const rights=validateSourceRightsManifest({schema:"geomacro.risk-stream-source-rights-reviewed.v1",
  entries:rightsEntries},now);
 const probeMap=new Map(probes.map(x=>[x.source_id,x]));
 const rawRows=candidates.map(candidate=>{
  const probe=probeMap.get(candidate.source_id)??null;
  const topicBucket=selectGlobalRiskQueryBucket(candidate.category,now.getTime());
  const classification=explicitRights(candidate,rights.approvedEntries,now);
  const fresh=probe&&probe.http_status===200&&["WORKING","NO_NEW_EVENT"].includes(probe.health_status)&&
   probe.last_successful_http_fetch_at&&Date.parse(probe.last_successful_http_fetch_at)<=now.getTime()&&
   now.getTime()-Date.parse(probe.last_successful_http_fetch_at)<=24*3600000&&
   probe.last_source_native_publication_at&&nativeTimestamp(probe.last_source_native_publication_at)&&
   Date.parse(probe.last_source_native_publication_at)<=now.getTime()+60000;
  const rightsApproved=classification.commercial_rights_approved===1;
  return {...candidate,...classification,
   topic_taxonomy_version:GLOBAL_RISK_QUERY_TAXONOMY_VERSION,
   discovery_topic_bucket_id:topicBucket.bucket_id,discovery_topic_tags:topicBucket.topic_tags,
   health_status:probe?.health_status??"NOT_PROBED",
   http_status:probe?.http_status??null,
   last_successful_http_fetch_at:probe?.last_successful_http_fetch_at??null,
   last_source_native_publication_at:probe?.last_source_native_publication_at??null,
   failure_reason:probe?.failure_reason??null,
   registry_sync_eligible:Boolean(fresh&&rightsApproved)};
 });
 const independentPairs=Object.fromEntries(Object.entries(RISK_STREAM_CATEGORY_ROLES).map(([category,[roleA,roleB]])=>{
  const usable=rawRows.filter(x=>x.category===category&&x.registry_sync_eligible);
  const pair=usable.some(a=>usable.some(b=>a.source_role===roleA&&b.source_role===roleB&&
   a.source_id!==b.source_id&&a.publisher_root_domain!==b.publisher_root_domain&&
   a.parent_media_entity!==b.parent_media_entity));
  return [category,{ready:pair,required_roles:[roleA,roleB],
   verified_source_ids:usable.map(x=>x.source_id).sort()}];
 }));
 const rows=rawRows.map(row=>({...row,registry_sync_eligible:Boolean(row.registry_sync_eligible&&independentPairs[row.category]?.ready)}));
 const entries=rights.approvedEntries.filter(entry=>rows.some(x=>x.source_id===entry.source_id&&
  x.registry_sync_eligible&&x.publisher_root_domain===entry.publisher_root_domain&&
  x.parent_media_entity===entry.parent_media_entity&&x.source_role===entry.source_role));
 return {schema:"geomacro.global-institutional-source-audit.v1",generated_at:nowIso(now),
  source_count:rows.length,probed_count:probes.length,
  rights_policy:"HTTP_200_AND_OFFICIAL_PUBLISHER_STATUS_NEVER_GRANT_COMMERCIAL_RIGHTS",
  commercial_eligibility_rule:"exact current APPROVED rights-manifest identity + category role + fresh parsed HTTP 200 + native publication timestamp",
  private_lane_rule:"all other candidates are redacted corroboration only",
  role_pairs:independentPairs,
  approved_registry_sync_count:entries.length,
  candidates:rows,
  eligible_manifest:{schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries,
   rights_status_changed:false}};
}
export async function discoverGlobalInstitutionalSources({candidates,rightsEntries,probe=false,
 probeLimit=24,fetchImpl=fetch,now=new Date()}={}){
 if(!Array.isArray(candidates)||candidates.length>100||!Array.isArray(rightsEntries))
  fail("INPUT_INVALID");
 if(!Number.isInteger(probeLimit)||probeLimit<1||probeLimit>24)fail("PROBE_LIMIT_INVALID");
 const selected=probe?candidates.slice(0,probeLimit):[];
 const probes=new Array(selected.length);let index=0;
 await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{
  while(index<selected.length){const i=index++,candidate=selected[i];
   probes[i]=await probeInstitutionalCandidate(candidate,{fetchImpl,now});}
 }));
 const report=buildInstitutionalSourceReport({candidates,rightsEntries,probes,now});
 return {report,probes};
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 const manifest=readJson(sourceManifestPath);
 const config=readJson(candidatesPath);
 const result=await discoverGlobalInstitutionalSources({candidates:config.sources,
  rightsEntries:manifest.entries,probe:args.probe,probeLimit:args.probeLimit,now:args.now});
 mkdirSync(resolve(args.output,".."),{recursive:true,mode:0o700});
 writeFileSync(args.output,JSON.stringify(result.report,null,2)+"\n",{mode:0o600});
 if(args.eligibleManifest){
  writeFileSync(args.eligibleManifest,JSON.stringify(result.report.eligible_manifest,null,2)+"\n",{mode:0o600});
 }
 process.stdout.write(JSON.stringify({schema:result.report.schema,
  candidates:result.report.source_count,probed:result.report.probed_count,
  approved_for_registry_sync:result.report.approved_registry_sync_count,
  role_pairs:result.report.role_pairs})+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await main()}catch(error){
  process.stderr.write(String(error?.message??"GLOBAL_INSTITUTIONAL_SOURCE_FAILED").slice(0,220)+"\n");
  process.exitCode=2;
 }
}
