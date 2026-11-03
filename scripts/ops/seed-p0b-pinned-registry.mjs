/**
 * P0-B: deterministic, idempotent seed of already pinned sources into the
 * P0-A D1 registry when the P0-B producer has actually been provisioned.
 * Never equate an October source probe with today's verified access.
 * Never grant commercial rights or assert event country from publisher locale.
 * No network and no source creation from unverifiable third parties.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const ROOT=new URL('../../',import.meta.url);
const parse=p=>JSON.parse(readFileSync(new URL(p,ROOT),'utf8'));
const manifest=parse('config/private-osint-working-sources.v1.json');
const ogl=parse('config/official-ogl-atom-sources.json');
if(manifest.schema!=='geomacro.private-osint-working-sources.v1'||
 !Array.isArray(manifest.sources)||manifest.sources.length!==369||
 manifest.accepted_endpoint_count!==manifest.sources.length||
 ogl.schema!=='geomacro.official-ogl-atom-sources.v1'||!Array.isArray(ogl.sources))
 throw Error('P0B_PINNED_SEED_MANIFEST_INVALID');
const validId=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const cats={geopolitics:'GEOPOLITICS',macro:'MACRO_FX',rare_earth:'CRITICAL_MINERALS',
 GEOPOLITICS:'GEOPOLITICS',MACRO:'MACRO_FX',CRITICAL_MINERALS:'CRITICAL_MINERALS'};
const types={rss:'RSS_2',atom:'ATOM',rdf:'RDF'};
const quote=x=>"'"+String(x).replace(/'/gu,"''")+"'";
const records=[],seen=new Set();
function add({id,url,category,type,probeOk}){
 if(!probeOk||!validId.test(id)||!cats[category]||!types[type])throw Error('P0B_PINNED_SOURCE_UNSUPPORTED');
 const sourceId=id+'.'+cats[category].toLowerCase();
 if(sourceId.length>120||seen.has(sourceId))throw Error('P0B_PINNED_SOURCE_COLLISION');
 const endpoint=new URL(url);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||
   endpoint.port||endpoint.hash||!endpoint.hostname.includes('.')||
   endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.local')||
   endpoint.hostname.endsWith('.internal')||endpoint.href.length>2048)
  throw Error('P0B_PINNED_SOURCE_ENDPOINT_INVALID');
 seen.add(sourceId);
 // GLOBAL is not a claim about the location of an event. Even an official
 // country publisher may report on unrelated geographic events.
 records.push(Object.freeze({
  id:sourceId,endpoint:endpoint.href,parser:types[type],
  category:cats[category],country:'GLOBAL',rights:'RESEARCH_ONLY'
 }));
}
for(const s of manifest.sources){
 if(!Array.isArray(s.categories)||!s.categories.length||new Set(s.categories).size!==s.categories.length||
 s.acceptance?.http_status!==200||s.acceptance?.feed_parsed!==true||
 s.acceptance?.native_publication_clock_present!==true)
  throw Error('P0B_PINNED_SOURCE_PROBE_UNVERIFIED');
 for(const category of s.categories)
  add({id:s.id,url:s.url,category,type:s.type,probeOk:true});
}
for(const s of ogl.sources){
 if(s.private_research_only!==true||s.ingest_transport!=='DIRECT_OFFICIAL_ATOM'||
  s.uses_publisher_native_clock_only!==true)
  throw Error('P0B_OFFICIAL_FEED_PROVENANCE_INVALID');
 add({id:s.source_id,url:s.feed_url,category:s.category,type:'atom',probeOk:true});
}
records.sort((a,b)=>a.id.localeCompare(b.id));
const stamp=JSON.stringify({max_retries:1,base_delay_ms:500,respect_retry_after:true});
const header='-- P0-B private source registry seed. Upserts are INSERT-ONLY.\n'+
 '-- All source rights remain RESEARCH_ONLY; no event-country inference.\n';
let sql=header;
for(const s of records){
 sql+='INSERT INTO source_registry(source_id,canonical_endpoint,parser_type,'+
 'intended_category,country_iso3,rights_tier,polling_interval_sec,'+
 'rate_limit_backoff,fallback_endpoint,last_cursor,enabled) VALUES ('+
 [s.id,s.endpoint,s.parser,s.category,s.country,s.rights].map(quote).join(',')+
 ',900,'+quote(stamp)+',NULL,NULL,1) ON CONFLICT(source_id) DO NOTHING;\n';
}
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output'||!args[1]||args[1]==='-')
 throw Error('P0B_SEED_OUTPUT_PATH_REQUIRED');
const output=resolve(args[1]);
writeFileSync(output,sql,{mode:0o600,flag:'wx'});
const byCategory={GEOPOLITICS:0,MACRO_FX:0,CRITICAL_MINERALS:0};
for(const s of records)byCategory[s.category]++;
if(Object.values(byCategory).some(n=>n<1))throw Error('P0B_SEED_CATEGORY_MISSING');
console.log(JSON.stringify({
 schema:'geomacro.p0b.pinned-registry-seed.v1',
 sourced_manifests:2,pinned_unique_endpoints:manifest.sources.length+ogl.sources.length,
 registry_config_rows:records.length,by_category:byCategory,
 historical_feed_probes_are_not_current_uptime:true,
 commercial_rights_promoted:false,
 production_ingestion_verified:false,sql_generated:true
}));
