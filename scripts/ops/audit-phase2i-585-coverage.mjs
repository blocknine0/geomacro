#!/usr/bin/env node
/**
 * First-party, read-only evidence-branch census. A 585-cell registry is not
 * 585 healthy publishers or 585 independently dated news observations.
 * Never stores third-party raw text, guesses event-time or changes rights.
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
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
const evidence=Object.freeze({
 schema:"geomacro.phase2i.coverage-585-branch-census.v1",
 branch:"phase2i-source-evidence",
 root_keys:cols(doc),arrays,objects,
 largest_array:sampleArray,
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
