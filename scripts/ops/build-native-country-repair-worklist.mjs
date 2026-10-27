#!/usr/bin/env node
/**
 * Deterministic 195x3 repair worklist from an actual bounded native-feed probe,
 * never from the route registry alone. Uses no network, D1, B2 or paid APIs.
 * No source URLs/article prose/publisher raw bytes in the output.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const int=n=>Number.isSafeInteger(n)&&n>=0;
const priority={NO_HEALTHY_SOURCE:0,LOCAL_SOURCE_UNHEALTHY:1,GLOBAL_FALLBACK_ONLY:2,
  REGIONAL_FALLBACK_ONLY:3,HEALTHY_NO_NATIVE_ITEM_THIS_TICK:4,LOCAL_HEALTHY_NATIVE_ITEM:5};
export function buildNativeCountryRepairWorklist(doc){
 if(!doc||doc.schema!=="geomacro.private-osint-live-coverage-report.v1"||
    doc.status==="PROBE_EXECUTION_FAILED"||
    doc.scope!=="READ_ONLY_PUBLIC_FEED_GETS_NO_PRIVATE_D1_WRITE_NO_B2_WRITE_NO_PUBLICATION"||
    !Array.isArray(doc.country_category_source_coverage?.cells)||
    doc.country_category_source_coverage.cells.length!==585||
    doc.country_category_source_coverage.returned_country_category_cells!==585||
    !int(doc.source_checks_completed)||!int(doc.observed_native_dated_items))
  throw Error("NATIVE_COUNTRY_WORKLIST_PROBE_UNVERIFIED");
 const seen=new Set(),countries=new Set(),output=[];
 for(const c of doc.country_category_source_coverage.cells){
  if(!c||!/^[A-Z]{3}$/u.test(c.country_iso3)||!CATS.has(c.category)||
     !["LOCAL_SOURCE_HEALTHY","REGIONAL_FALLBACK_HEALTHY",
       "GLOBAL_FALLBACK_HEALTHY","NO_SOURCE_CONFIGURED",
       "CONFIGURED_NOT_YET_CHECKED","NO_HEALTHY_SOURCE_IN_LAST_TICK"].includes(c.source_tier_status)||
     !int(c.local?.registered)||!int(c.local?.healthy)||
     !int(c.regional?.healthy)||!int(c.global?.healthy)||
     !int(c.healthy_source_slots)||!int(c.observed_private_items_this_tick)||
     c.event_country_verified!==false||c.original_source_rights_verified!==false)
   throw Error("NATIVE_COUNTRY_WORKLIST_CELL_INVALID");
  const key=c.country_iso3+":"+c.category;
  if(seen.has(key))throw Error("NATIVE_COUNTRY_WORKLIST_DUPLICATE");
  seen.add(key);countries.add(c.country_iso3);
  const reason=c.healthy_source_slots===0?"NO_HEALTHY_SOURCE":
    c.local.registered>0&&c.local.healthy===0?"LOCAL_SOURCE_UNHEALTHY":
    c.local.registered===0&&c.regional.healthy===0?"GLOBAL_FALLBACK_ONLY":
    c.local.registered===0?"REGIONAL_FALLBACK_ONLY":
    c.observed_private_items_this_tick===0?"HEALTHY_NO_NATIVE_ITEM_THIS_TICK":
    "LOCAL_HEALTHY_NATIVE_ITEM";
  const action=reason==="NO_HEALTHY_SOURCE"?"REPAIR_NATIVE_FEED_OR_ADD_CHECKABLE_LOCAL_SOURCE":
    reason==="LOCAL_SOURCE_UNHEALTHY"?"FIX_REGISTERED_LOCAL_ENDPOINT_AND_REPROBE":
    reason==="GLOBAL_FALLBACK_ONLY"||reason==="REGIONAL_FALLBACK_ONLY"?
      "DISCOVER_AND_VALIDATE_FIRST_PARTY_LOCAL_PUBLISHER":
    reason==="HEALTHY_NO_NATIVE_ITEM_THIS_TICK"?"MONITOR_SOURCE_NATIVE_DATES_NO_FAKE_NEWS":
      "CONTINUE_NATIVE_DATED_FEED_MONITORING";
  output.push({country_iso3:c.country_iso3,category:c.category,priority:priority[reason],
    diagnosis:reason,next_action:action,
    local_publisher_configured:c.local.registered>0,
    local_feed_healthy_this_tick:c.local.healthy>0,
    fallback_healthy_this_tick:c.regional.healthy+c.global.healthy>0,
    native_country_attributed_items_this_tick:c.observed_private_items_this_tick,
    event_country_verified:false,live_ingestion_585_verified:false});
 }
 if(seen.size!==585||countries.size!==195)
  throw Error("NATIVE_COUNTRY_WORKLIST_195X3_INVALID");
 output.sort((a,b)=>a.priority-b.priority||
   a.country_iso3.localeCompare(b.country_iso3)||
   a.category.localeCompare(b.category));
 const reasons=Object.fromEntries(Object.keys(priority).map(key=>[key,
   output.filter(x=>x.diagnosis===key).length]));
 const cellsWithObserved=output.filter(x=>x.native_country_attributed_items_this_tick>0).length;
 return {
  schema:"geomacro.native-country-195x3-repair-worklist.v1",
  probed_at:doc.generated_at,
  source_checks_completed:doc.source_checks_completed,
  country_count:195,category_count:3,cells:585,
  gaps_by_reason:reasons,observed_native_country_cells_this_tick:cellsWithObserved,
  cells_without_observed_native_items_this_tick:585-cellsWithObserved,
  all_585_native_ingestion_verified:false,
  item_absence_is_not_proof_of_no_news:true,
  source_health_is_not_independent_event_verification:true,
  publisher_country_is_not_event_country:true,
  no_d1_reads_or_writes:true,no_b2_operations:true,no_paid_calls:true,
  priority_worklist:output
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==4)throw Error("NATIVE_COUNTRY_WORKLIST_ARGS_INVALID");
  const doc=JSON.parse(readFileSync(process.argv[2],"utf8"));
  const result=buildNativeCountryRepairWorklist(doc);
  const destination=resolve(process.argv[3]);
  mkdirSync(resolve(destination,".."),{recursive:true});
  writeFileSync(destination,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({
   schema:result.schema,cells:585,countries:195,
   observed_native_country_cells_this_tick:result.observed_native_country_cells_this_tick,
   gaps_by_reason:result.gaps_by_reason,
   original_event_country_verified:false,all_585_native_ingestion_verified:false,
   d1_queries:0,b2_requests:0,payments:0
  }));
 }catch{
  console.error("NATIVE_COUNTRY_WORKLIST_PROBE_UNVERIFIED");process.exitCode=2;
 }
}
