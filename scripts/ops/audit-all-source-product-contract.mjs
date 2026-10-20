#!/usr/bin/env node
/**
 * Zero-network, all-registry intake census. This is a coverage/accountability
 * report, NOT evidence that reference URLs are live or commercially licensed.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {SOURCE_LINEUP} from "../lib/operator-commercial-free-source-lineup.mjs";
import {PRODUCTION_FREE_UPDATE_SOURCES} from "../lib/free-source-production-updates.mjs";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS} from "../lib/global-official-release-feeds.mjs";
const read=p=>JSON.parse(readFileSync(p,"utf8"));
const country=read("config/operator-country-source-crosswalk.v1.json");
const corridor=read("config/operator-corridor-source-crosswalk.v1.json");
const minerals=read("global-intelligence/sources/national-minerals-authority.v1.json");
const countryRegistry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const record=/const COUNTRY_ROWS=`([^`]+)`;/u.exec(countryRegistry);
if(!record)throw Error("SOURCE_CENSUS_195_REGISTRY_MISSING");
const countries=record[1].trim().split("\n");
if(countries.length!==195||
   new Set(countries.map(s=>s.split("|")[0])).size!==195||
   !countries.some(s=>s.startsWith("PSE|"))||
   !countries.some(s=>s.startsWith("VAT|")))throw Error("SOURCE_CENSUS_195_REGISTRY_INVALID");
const DOMAINS=["geopolitics","macro","rare_earth"];
const toDomain=value=>({
  geopolitics:"geopolitics",macro:"macro",macro_fx:"macro",
  rare_earth:"rare_earth",critical_minerals:"rare_earth",
})[value]??null;
const entries=[];
function accept(registry,id,domains,meta={}){
 if(typeof id!=="string"||!id.trim()||!Array.isArray(domains)||!domains.length)
   throw Error("SOURCE_CENSUS_ENTRY_ID_OR_DOMAINS_INVALID:"+registry);
 const valid=[...new Set(domains.map(toDomain))];
 if(valid.includes(null)||valid.length===0)throw Error("SOURCE_CENSUS_UNKNOWN_DOMAIN:"+registry);
 entries.push({
  registry,reference_id:id,domains:valid,
  source_read_confirmed:meta.source_read_confirmed===true,
  original_current_event_verified:meta.original_current_event_verified===true,
  rights_for_commercial_delivery_verified:meta.rights_for_commercial_delivery_verified===true,
  note:meta.note??"REFERENCE_ONLY_NOT_PRODUCTION_ACCEPTED",
 });
}
if(country.schema!=="geomacro.operator-country-source-crosswalk.v1"||
   corridor.schema!=="geomacro.operator-corridor-source-crosswalk.v1"||
   country.full_country_coverage_verified!==false||
   corridor.commercial_route_score_available!==false)
 throw Error("SOURCE_CENSUS_REGISTRY_CONTRACT_CHANGED");
for(const entry of country.global_country_dim)
 accept("country_global",entry.id,[entry.category],{
   source_read_confirmed:entry.access_verified_in_production,
   original_current_event_verified:entry.freshness_claim_verified&&entry.access_verified_in_production,
   rights_for_commercial_delivery_verified:entry.commercial_eligible&&entry.provider_rights_verified,
 });
for(const entry of country.national_primary)
 accept("country_national",entry.id,[entry.category],{
   source_read_confirmed:entry.access_verified_in_production,
   original_current_event_verified:entry.publication_date_verified&&entry.access_verified_in_production,
   rights_for_commercial_delivery_verified:entry.commercial_eligible&&entry.provider_rights_verified,
 });
for(const entry of corridor.source_registry){
 accept("corridor_provider",entry.source_id,["geopolitics","macro","rare_earth"],{
   source_read_confirmed:entry.transport_tested,
   rights_for_commercial_delivery_verified:entry.commercial_licence_verified,
   note:"CORRIDOR_PROVIDER_REFERENCE_NOT_THREE_DOMAIN_ACTIVATION",
 });
}
for(const entry of minerals.sources)
 accept("national_minerals_authority",entry.iso3+"|"+entry.authority_name,["rare_earth"],{
   // Even ONBOARDED ministry is a directory, not a qualified current event.
   note:"NATIONAL_AUTHORITY_DIRECTORY_NEEDS_EXACT_ORIGINAL_RELEASE",
 });
for(const entry of SOURCE_LINEUP)
 accept("operator_source_family",entry.id,[entry.category],{
   note:entry.catalog_rights_status==="EXISTING_EXACT_DATASET_VERIFIED"?
    "EXACT_DATASET_RIGHTS_REFERENCE_ONLY_NEEDS_LIVE_EVIDENCE":
    "NO_CURRENT_COMMERCIAL_RIGHTS_CERTIFIED",
 });
const byId=new Map(SOURCE_LINEUP.map(e=>[e.id,e.category]));
const globalById=new Map(GLOBAL_OFFICIAL_RELEASE_FEEDS.map(e=>[e.id,e]));
if(globalById.size!==GLOBAL_OFFICIAL_RELEASE_FEEDS.length)
  throw Error("SOURCE_CENSUS_DUPLICATE_GLOBAL_OFFICIAL_FEED");
for(const source of GLOBAL_OFFICIAL_RELEASE_FEEDS)
  accept("registered_global_official_release",source.id,[source.category],{
    note:"OFFICIAL_SOURCE_DIRECTORY_NOT_A_CURRENT_EVENT",
  });
const readerIds=new Set();
for(const reader of PRODUCTION_FREE_UPDATE_SOURCES){
 if(readerIds.has(reader.id))throw Error("SOURCE_CENSUS_DUPLICATE_READER:"+reader.id);
 readerIds.add(reader.id);
 const global=globalById.get(reader.id);
 const globallyRegistered=global?.category===reader.category &&
   global?.url===reader.url;
 if(byId.get(reader.id)!==reader.category && !globallyRegistered)
   throw Error("SOURCE_CENSUS_ORPHAN_PRODUCTION_READER:"+reader.id);
 accept("running_source_reader",reader.id,[reader.category],{
   note:"READER_CONFIGURED_NO_RUNTIME_HEALTH_ASSERTED",
 });
}
if(corridor.corridors.length!==58||country.global_country_dim.length<30||
   country.national_primary.length<60||SOURCE_LINEUP.length<50)
 throw Error("SOURCE_CENSUS_REFERENCE_REGISTRY_SHRANK");
const states=Object.fromEntries(DOMAINS.map(domain=>[domain,{
 source_reference_records:entries.filter(e=>e.domains.includes(domain)).length,
 configured_update_reader_records:entries.filter(e=>
   e.registry==="running_source_reader"&&e.domains.includes(domain)).length,
 verified_current_country_domain_cells:0,
 all_sources_live_verified:false,
 commercial_event_delivery_certified:false,
}]));
const summary={
 schema:"geomacro.all-source-three-domain-reference-census.v1",
 checked_at:new Date().toISOString(),
 canonical_country_registry_count:countries.length,
 named_corridor_registry_count:corridor.corridors.length,
 input_registry_counts:{
  global_country_source_rows:country.global_country_dim.length,
  national_country_source_rows:country.national_primary.length,
  corridor_provider_rows:corridor.source_registry.length,
  national_mineral_authorities:minerals.sources.length,
  existing_source_lineup_families:SOURCE_LINEUP.length,
  registered_official_global_release_feeds:GLOBAL_OFFICIAL_RELEASE_FEEDS.length,
  configured_source_update_readers:PRODUCTION_FREE_UPDATE_SOURCES.length,
 },
 reference_records_checked:entries.length,
 domains:states,
 all_reference_entries_classified:entries.every(e=>e.domains.every(d=>DOMAINS.includes(d))),
 provider_urls_exposed:false,
 all_195x3_runtime_cells_accepted:false,
 physical_corridor_routes_verified:false,
 index_scoring_derived_from_this_report:false,
 rights_approval_derived_from_this_report:false,
 charge_authorized:false,paid_delivery_enabled:false,
 supabase_requests:0,d1_writes:0,b2_requests:0,external_calls:0,payments:0,
};
if(process.argv.includes("--write")){
 const path="artifacts/all-source-product-contract/source-census.json";
 mkdirSync("artifacts/all-source-product-contract",{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify(summary,null,2)+"\n",{mode:0o600});
}
console.log(JSON.stringify(summary));
