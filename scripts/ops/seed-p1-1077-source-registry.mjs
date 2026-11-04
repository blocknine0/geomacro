#!/usr/bin/env node
/** Generate deterministic source/category D1 registration from 369 independently
 * observed (source-known) endpoint definitions plus eight licensed official
 * Atom feeds. A lane is one endpoint/category combination, not 1077 URLs.
 *
 * This seeder NEVER fetches an unavailable feed or certifies current health.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
const working=JSON.parse(readFileSync("config/private-osint-working-sources.v1.json","utf8"));
const ogl=JSON.parse(readFileSync("config/official-ogl-atom-sources.json","utf8"));
const GROUPS=Object.freeze({geopolitics:"GEOPOLITICS",
 macro:"MACRO_FX",rare_earth:"CRITICAL_MINERALS"});
const PARSERS=Object.freeze({rss:"RSS_2",rdf:"RDF",atom:"ATOM"});
const KEY=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u,COUNTRY=/^[A-Z]{3}$/u;
const fail=s=>{throw Error("P1_1077_SEED_"+s)};
const sha=s=>createHash("sha256").update(s).digest("hex");
const esc=s=>"'"+String(s).replaceAll("'","''")+"'";
const validateUrl=value=>{
 if(typeof value!=="string"||value.length>2048)fail("URL_INVALID");
 const u=new URL(value);
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
    !u.hostname.includes(".")||u.hostname.endsWith(".local")||
    /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/u.test(u.hostname))
  fail("URL_UNSAFE");
 return value;
};
const row=(source_id,canonical_endpoint,parser_type,intended_category,country_iso3)=>({
 source_id,canonical_endpoint:validateUrl(canonical_endpoint),
 parser_type,intended_category,country_iso3:COUNTRY.test(country_iso3??"")?
  country_iso3:"GLOBAL",rights_tier:"RESEARCH_ONLY",
 polling_interval_sec:3600,rate_limit_backoff:JSON.stringify({
  max_retries:2,base_delay_ms:500,respect_retry_after:true
 })
});
export function buildP1SourceRegistration(){
 if(working?.sources?.length!==369||ogl?.sources?.length!==8)
  fail("PINNED_MANIFEST_COUNT_CHANGED");
 const rows=[];
 for(const s of working.sources){
  if(s?.acceptance?.http_status!==200||
     s?.acceptance?.feed_parsed!==true||
     s?.acceptance?.native_publication_clock_present!==true||
     !KEY.test(s.id)||!Object.hasOwn(PARSERS,s.type)||
     !Array.isArray(s.categories)||s.categories.length<1)
   fail("WORKING_SOURCE_NOT_VERIFIED");
  for(const category of s.categories){
   if(!Object.hasOwn(GROUPS,category))fail("CATEGORY_INVALID");
   const tag=category==="macro"?"macro_fx":
    category==="rare_earth"?"critical_minerals":"geopolitics";
   rows.push(row(s.id+"."+tag,s.url,PARSERS[s.type],
    GROUPS[category],s.publisher_country_iso3));
  }
 }
 const observedLanes=rows.length;
 if(observedLanes!==1069)fail("PRIVATE_1069_LANES_DRIFTED");
 for(const s of ogl.sources){
  if(!KEY.test(s.source_id)||!["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].includes(s.category)||
     s.private_research_only!==true||s.ingest_transport!=="DIRECT_OFFICIAL_ATOM")
   fail("OGL_SOURCE_SCOPE_INVALID");
  rows.push(row(s.source_id,s.feed_url,"ATOM",
   s.category==="MACRO"?"MACRO_FX":s.category,s.owner_country_iso3));
 }
 if(rows.length!==1077||new Set(rows.map(s=>s.source_id)).size!==1077)
  fail("SOURCE_1077_COUNT_OR_ID_DRIFT");
 return Object.freeze(rows);
}
export function renderP1SourceRegistrationSQL(records){
 if(!Array.isArray(records)||records.length!==1077||
    new Set(records.map(r=>r.source_id)).size!==records.length)
  fail("SQL_RECORDS_INVALID");
 const lines=[];
 const keys=["source_id","canonical_endpoint","parser_type","intended_category",
  "country_iso3","rights_tier","polling_interval_sec","rate_limit_backoff"];
 for(let i=0;i<records.length;i+=40){
  const chunk=records.slice(i,i+40);
  for(const r of chunk){
   if(!KEY.test(r.source_id)||r.rights_tier!=="RESEARCH_ONLY"||
      !Number.isSafeInteger(r.polling_interval_sec)||
      r.polling_interval_sec<300||r.polling_interval_sec>3600||
      !["RSS_2","ATOM","RDF"].includes(r.parser_type))
    fail("ROW_CONTRACT_INVALID");
   validateUrl(r.canonical_endpoint);
  }
  const values=chunk.map(r=>"("+keys.map(k=>
   typeof r[k]==="number"?String(r[k]):esc(r[k])).join(",")+")").join(",\n");
  lines.push("INSERT INTO source_registry("+keys.join(",")+") VALUES\n"+values+
   " ON CONFLICT(source_id) DO UPDATE SET "+
   "canonical_endpoint=excluded.canonical_endpoint,"+
   "parser_type=excluded.parser_type,"+
   "intended_category=excluded.intended_category,"+
   "country_iso3=excluded.country_iso3,"+
   "rights_tier='RESEARCH_ONLY',"+
   "polling_interval_sec=excluded.polling_interval_sec,"+
   "rate_limit_backoff=excluded.rate_limit_backoff WHERE "+
   "source_registry.canonical_endpoint<>excluded.canonical_endpoint OR "+
   "source_registry.parser_type<>excluded.parser_type OR "+
   "source_registry.intended_category<>excluded.intended_category OR "+
   "source_registry.country_iso3<>excluded.country_iso3 OR "+
   "source_registry.rights_tier<>'RESEARCH_ONLY' OR "+
   "source_registry.polling_interval_sec<>excluded.polling_interval_sec OR "+
   "source_registry.rate_limit_backoff<>excluded.rate_limit_backoff;");
  const receipts=chunk.map(r=>"("+esc(r.source_id)+","+esc(sha([
   r.source_id,r.canonical_endpoint,r.parser_type,r.intended_category,
   r.country_iso3,r.polling_interval_sec].join("|")))+","+
   "strftime('%Y-%m-%dT%H:%M:%fZ','now'))").join(",\n");
  lines.push("INSERT INTO p1_source_seed_manifest(source_id,seed_sha256,seeded_at) VALUES\n"+
   receipts+" ON CONFLICT(source_id) DO UPDATE SET "+
   "seed_sha256=excluded.seed_sha256,seeded_at=excluded.seeded_at "+
   "WHERE p1_source_seed_manifest.seed_sha256<>excluded.seed_sha256;");
 }
 // Only physically specific-country sources are mapped. Explicit priorities
 // are based on real source definitions; missing primary/backup slots stay gaps.
 lines.push(
  "INSERT OR IGNORE INTO p1_source_to_cell(source_id,country_iso3,primary_category,rank) "+
  "SELECT source_id,country_iso3,intended_category,"+
  "CASE WHEN ordinal<=2 THEN ordinal ELSE 3 END FROM ("+
  "SELECT source_id,country_iso3,intended_category,"+
  "ROW_NUMBER() OVER (PARTITION BY country_iso3,intended_category ORDER BY source_id) AS ordinal "+
  "FROM source_registry WHERE enabled=1 AND country_iso3<>'GLOBAL'"+
  ") WHERE ordinal<=3;"
 );
 return lines.join("\n")+"\n";
}
if(import.meta.url==="file://"+process.argv[1]){
 const rows=buildP1SourceRegistration();
 const sql=renderP1SourceRegistrationSQL(rows);
 mkdirSync("workers/control-plane/generated",{recursive:true});
 const output="workers/control-plane/generated/p1-1077-seed.sql";
 writeFileSync(output,sql,{mode:0o600});
 const urls=new Set(rows.map(x=>x.canonical_endpoint));
 console.log(JSON.stringify({schema:"geomacro.p1.source-manifest-1077.v1",
  configured_lanes:rows.length,distinct_endpoints:urls.size,
  private_osint_lanes:1069,official_atom_lanes:8,
  generated_sql_path:output,rights_promoted:false,
  source_reachability_reverified_this_run:false}));
}
