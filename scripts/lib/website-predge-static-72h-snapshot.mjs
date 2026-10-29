/**
 * Public, source-safe, single-read rolling 72h Website Intelligence cohort.
 * This is a materialized derivative of the EXISTING Website archive, not an
 * additional D1/PREDGE ingest, licensed dataset, risk score or paid product.
 */
import {createHash} from "node:crypto";
import {isPermanentArchiveSignal,CATEGORIES} from "../ops/publish-permanent-derived-news-archive.mjs";

export const WEBSITE_PILOT_SNAPSHOT_SCHEMA="geomacro.website-intelligence-three-category-72h.v1";
export const WEBSITE_PILOT_MAX_ROWS=600;
const err=code=>{throw Error("WEBSITE_PILOT_SNAPSHOT_"+code)};
const tally=rows=>Object.fromEntries(CATEGORIES.map(category=>[
 category,rows.filter(row=>row.category===category).length,
]));
const idDigest=rows=>createHash("sha256")
 .update(rows.map(row=>row.id).sort().join("\n")).digest("hex");

export function buildWebsitePilotSnapshot(archiveRows,now=Date.now()){
 if(!Array.isArray(archiveRows)||!Number.isFinite(now))err("INPUT_INVALID");
 const records=[],ids=new Map();
 for(const row of archiveRows){
  if(!isPermanentArchiveSignal(row,now,{allowHistorical:true}))
   err("INVALID_ARCHIVE_ROW");
  if(!isPermanentArchiveSignal(row,now,{allowHistorical:false}))continue;
  if(ids.has(row.id)){
   if(JSON.stringify(ids.get(row.id))!==JSON.stringify(row))
    err("CONFLICTING_SOURCE_NATIVE_ID");
   err("DUPLICATE_SOURCE_NATIVE_ID");
  }
  ids.set(row.id,row);
  records.push(row);
 }
 if(records.length>WEBSITE_PILOT_MAX_ROWS)err("CAPACITY_OVER_600_FAIL_CLOSED");
 records.sort((a,b)=>b.published_at.localeCompare(a.published_at)||
   a.id.localeCompare(b.id));
 const counts=tally(records);
 return Object.freeze({
  schema:WEBSITE_PILOT_SNAPSHOT_SCHEMA,ok:true,
  checked_at:new Date(now).toISOString(),
  source:"GEOMACRO_PUBLIC_WEBSITE_INTELLIGENCE_ARCHIVE",
  categories:[...CATEGORIES],
  original_release_delay_minutes:0,
  retention_hours:72,
  complete:true,max_items:WEBSITE_PILOT_MAX_ROWS,
  item_count:records.length,counts,
  source_native_ids_sha256:idDigest(records),
  free_website_only:true,attributed_research_only:true,
  scored:false,signed:false,chargeable:false,
  upstream_source_rights_automatically_granted:false,
  unverified_osint_remains_unverified:true,
  raw_upstream_delivered:false,payments:0,
  signals:records,
 });
}
