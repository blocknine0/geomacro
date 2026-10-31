#!/usr/bin/env node
/** Daily zero-network official mineral issuer sourcing queue from real 585-cell census. */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {pathToFileURL} from "node:url";
export function buildMineralNationalPortalRepair(report,manifest){
 if(report?.schema!=="geomacro.native-country-195x3-repair-worklist.v1"||
    !Array.isArray(report.priority_worklist)||report.priority_worklist.length!==585||
    manifest?.schema!=="geomacro.private-osint-mineral-national-portals.v1"||
    manifest.scope!=="PRIVATE_SOURCE_DISCOVERY_ONLY"||
    !Array.isArray(manifest.targets)||manifest.targets.length!==20)
  throw Error("MINERAL_PORTAL_CENSUS_INVALID");
 const unique=new Set(),mineralCells=new Map(report.priority_worklist
   .filter(row=>row.category==="rare_earth").map(row=>[row.country_iso3,row]));
 const rows=manifest.targets.map(item=>{
  const cell=mineralCells.get(item.country_iso3);
  if(unique.has(item.country_iso3)||!cell||
     !/^[A-Z]{3}$/u.test(item.country_iso3)||
     item.verified_native_feed_url!==null||
     item.source_promotion_state!=="EXACT_NATIVE_RSS_OR_ATOM_REQUIRED"||
     item.publisher_rights_verified!==false||
     item.live_event_coverage_verified!==false)
    throw Error("MINERAL_PORTAL_TARGET_UNSAFE");
  unique.add(item.country_iso3);
  if(item.authority_homepage!==null){
   let url;try{url=new URL(item.authority_homepage)}catch{throw Error("MINERAL_PORTAL_URL_INVALID")}
   if(url.protocol!=="https:"||url.username||url.password||url.hash||!url.hostname.includes("."))
     throw Error("MINERAL_PORTAL_URL_INVALID");
  }
  return {country_iso3:item.country_iso3,
   native_dated_event_items_this_tick:cell.native_country_attributed_items_this_tick,
   local_feed_healthy_this_tick:cell.local_feed_healthy_this_tick,
   diagnosis:cell.diagnosis,
   official_portal_reference:item.authority_homepage,
   next_action:item.authority_homepage?
     "FIND_AND_VERIFY_EXACT_NATIVE_DATED_FIRST_PARTY_FEED":
     "CONFIRM_FIRST_PARTY_MINING_AGENCY_AND_EXACT_RSS_ENDPOINT",
   live_feed_added_by_this_worklist:false,news_record_created:false};
 });
 rows.sort((a,b)=>Number(a.native_dated_event_items_this_tick>0)-
   Number(b.native_dated_event_items_this_tick>0)||
   a.country_iso3.localeCompare(b.country_iso3));
 return {schema:"geomacro.mineral-national-portal-repair.v1",
  probed_at:report.probed_at,priority_countries:20,
  countries_with_dated_items_this_tick:rows.filter(r=>r.native_dated_event_items_this_tick>0).length,
  countries_without_dated_items_this_tick:rows.filter(r=>r.native_dated_event_items_this_tick===0).length,
  pending_exact_rss_qualification:20,
  next_source_checks_extra_gets:0,
  published_new_mineral_news_count:0,
  official_portal_homepage_is_not_rss:true,requires_independent_source_clock:true,
  sources:rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==5)throw Error("MINERAL_PORTAL_ARGS_INVALID");
  const report=JSON.parse(readFileSync(process.argv[2],"utf8"));
  const manifest=JSON.parse(readFileSync(process.argv[3],"utf8"));
  const result=buildMineralNationalPortalRepair(report,manifest);
  const dest=resolve(process.argv[4]);mkdirSync(dirname(dest),{recursive:true});
  writeFileSync(dest,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({schema:result.schema,
   priority_countries:result.priority_countries,
   countries_with_dated_items_this_tick:result.countries_with_dated_items_this_tick,
   extra_http_gets:0,d1_writes:0,b2_writes:0,payments:0}));
 }catch{console.error("MINERAL_PORTAL_CENSUS_INVALID");process.exitCode=2}
}
