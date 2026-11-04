#!/usr/bin/env node
/**
 * First-party, read-only evidence-branch census. A 585-cell registry is not
 * 585 healthy publishers or 585 independently dated news observations.
 * Never stores third-party raw text, guesses event-time or changes rights.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {HOT50_COUNTRY_SET} from "../lib/hot-50-country-watch.mjs";
const path=resolve(process.argv[2]??"");
if(!path.endsWith("/data/phase2i/coverage-585.latest.json"))
 throw Error("PHASE2I_585_EVIDENCE_PATH_INVALID");
let doc;
try{doc=JSON.parse(readFileSync(path,"utf8"))}
catch{throw Error("PHASE2I_585_EVIDENCE_JSON_INVALID")}
if(!doc||typeof doc!=="object"||Array.isArray(doc))
 throw Error("PHASE2I_585_EVIDENCE_ROOT_INVALID");
const cols=(x)=>Object.keys(x??{}).slice(0,40);
const arrays=Object.entries(doc).filter(([,v])=>Array.isArray(v)).map(
 ([key,value])=>({key,size:value.length,sample_fields:value[0]&&
 typeof value[0]==="object"?cols(value[0]):[]})).slice(0,30);
const objects=Object.entries(doc).filter(([,v])=>v&&typeof v==="object"&&
 !Array.isArray(v)).map(([key,value])=>({key,keys:cols(value).slice(0,12)}))
 .slice(0,20);
const sampleArray=arrays.find(v=>v.size===585)
 ??arrays.sort((a,b)=>b.size-a.size)[0]??null;
const snap=doc.generated_at??doc.checked_at??doc.updated_at??doc.snapshot_at??null;
const latest=snap&&Number.isFinite(Date.parse(String(snap)))?
 new Date(String(snap)).toISOString():null;
const sourceAgeHours=latest?Math.round(
 (Date.now()-Date.parse(latest))/3600_000*100)/100:null;
const cells=Array.isArray(doc.cells)?doc.cells:[];
if(cells.length!==585||doc.country_count!==195||doc.category_count!==3||
   doc.cell_count!==585||HOT50_COUNTRY_SET.size!==50)
 throw Error("PHASE2I_585_COUNTRY_CATEGORY_MANIFEST_INVALID");
const unique=new Set(cells.map(c=>JSON.stringify([c.country_iso3,c.category])));
if(unique.size!==585)throw Error("PHASE2I_585_DUPLICATE_COUNTRY_CATEGORY");
const categories=["geopolitics","macro","rare_earth"];
const count=(items,fn)=>items.filter(fn).length;
const expectedKeys=["source_status","source_fetch_status",
 "country_original_event_observation_status",
 "canonical_d1_raw_staging_status","private_b2_archive_status"];
const countsByField=Object.fromEntries(expectedKeys.map(key=>[
 key,Object.fromEntries([...new Set(cells.map(x=>String(x?.[key]??"UNSPECIFIED")))]
  .sort().map(value=>[value,count(cells,c=>
   String(c?.[key]??"UNSPECIFIED")===value)]))
]));
const summarize=rows=>({
 cells:rows.length,
 registered_feed_reference_cells:count(rows,c=>Array.isArray(c.registered_source_ids)&&
  c.registered_source_ids.length>0),
 source_http_actual_success_cells:count(rows,c=>c.last_actual_successful_http_fetch_at&&
  Number.isFinite(Date.parse(c.last_actual_successful_http_fetch_at))),
 country_event_verified_cells:count(rows,c=>c.country_event_verified===true),
 country_event_native_item_cells:count(rows,c=>Number(c.actual_country_attributed_news_candidates)>0),
 native_original_within_20m_cells:count(rows,c=>{
   const t=Date.parse(c.last_source_native_publication_at??
     c.last_source_native_publication_time??"");
   return Number.isFinite(t)&&t<=Date.now()&&
     Date.now()-t<=20*60_000&&c.country_event_verified===true;
 }),
 exact_canonical_d1_staged_cells:count(rows,c=>
   Number(c.canonical_d1_raw_staged_count)>0),
 exact_private_b2_archived_cells:count(rows,c=>
   Number(c.private_b2_archived_count)>0),
});
const countryCoverage=Object.fromEntries(categories.map(category=>[
 category,summarize(cells.filter(c=>c.category===category))]));
const hot50=summarize(cells.filter(c=>HOT50_COUNTRY_SET.has(c.country_iso3)));
const other145=summarize(cells.filter(c=>!HOT50_COUNTRY_SET.has(c.country_iso3)));
const evidence=Object.freeze({
 schema:"geomacro.phase2i.coverage-585-branch-census.v1",
 branch:"phase2i-source-evidence",
 root_keys:cols(doc),arrays,objects,
 largest_array:sampleArray,
 declared_registered_sources:doc.registered_source_count,
 declared_verified_http_sources:doc.verified_http_source_count,
 declared_requests_in_source_run:doc.actual_source_requests_this_run,
 declared_status_counts:doc.status_counts,
 country_category_status_counts:countsByField,
 per_category_truth:countryCoverage,hot50_truth:hot50,other145_truth:other145,
 hot50_total_cells:150,other145_total_cells:435,
 source_snapshot_native_time:latest,
 source_snapshot_age_hours:sourceAgeHours,
 source_snapshot_current_20m:sourceAgeHours!==null&&
  sourceAgeHours>=0&&sourceAgeHours<=1/3,
 all_585_cells_have_active_source_verified:false,
 all_585_cells_have_native_dated_events_verified:false,
 live_news_pipeline_readback_verified:false,
 coverage_branch_is_live_ingestion_proof:false,
 rights_or_commercial_validity_asserted:false,
 no_news_fetched:true,d1_writes:0,b2_requests:0
});
console.log(JSON.stringify(evidence));
if(!sampleArray)throw Error("PHASE2I_585_EVIDENCE_NO_INDEX_ARRAY");
