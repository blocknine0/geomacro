/**
 * Read-only comparison of already acknowledged free derived-news IDs against
 * two fresh, bounded canonical D1 snapshots. Never counts a PUT ACK as an
 * insert, mutates retention, or upgrades publisher/commercial authority.
 */
import {createHash} from "node:crypto";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const hash=s=>createHash("sha256").update(s).digest("hex");
const fail=code=>{throw Error("PHASE2G_D1_RECONCILIATION_"+code)};
const safeTime=(s,now)=>{
 const at=Date.parse(s);
 return Number.isFinite(at)&&at<=now+60_000&&at>=now-72*60*60_000;
};
function indexed(rows,now,{historicalBaseline=false}={}){
 if(!Array.isArray(rows)||rows.length>600)fail("SNAPSHOT_UNBOUNDED");
 const index=new Map();
 for(const s of rows){
  if(!s||typeof s.id!=="string"||s.id.length<1||s.id.length>160||
     index.has(s.id)||!CATEGORIES.includes(s.category)||
     !(Number.isFinite(Date.parse(s.published_at)))||
     (!historicalBaseline&&(!verifyDerivedStory(s,now)||!safeTime(s.published_at,now))))
   fail("CANONICAL_SNAPSHOT_INVALID");
  index.set(s.id,s);
 }
 return index;
}
export function reconcileAcknowledgedDerivedNews({
 before,after,acknowledged,now=Date.now(),sourceSha=""
}={}){
 if(!Number.isFinite(now)||!Array.isArray(acknowledged)||
    acknowledged.length<1||acknowledged.length>600||
    !/^[a-f0-9]{40}$/u.test(sourceSha))fail("INPUT_INVALID");
 // An unrelated baseline row can naturally expire during a bounded publisher run;
 // only acknowledged post-write IDs must satisfy the CURRENT 72h window.
 const previous=indexed(before,now,{historicalBaseline:true}),current=indexed(after,now);
 const seen=new Set();
 const counts=Object.fromEntries(CATEGORIES.map(x=>[x,{
   acknowledged:0,newly_observed:0,updated_observed:0,unchanged_observed:0,
   independent_get_matched:0
 }]));
 const ids=[];
 for(const expected of acknowledged){
  if(!expected||seen.has(expected.id)||!CATEGORIES.includes(expected.category)||
     !verifyDerivedStory(expected,now)||!safeTime(expected.published_at,now))
    fail("ACKNOWLEDGED_ID_INVALID_OR_DUPLICATE");
  seen.add(expected.id);
  const obtained=current.get(expected.id);
  if(!obtained)fail("ACKNOWLEDGED_ID_MISSING_AFTER_GET");
  if(JSON.stringify(expected)!==JSON.stringify(obtained))
   fail("POST_GET_PAYLOAD_OR_ORIGINAL_TIME_MISMATCH");
  const old=previous.get(expected.id);
  if(old&&(old.category!==expected.category||
     old.published_at!==expected.published_at||
     old.date_precision!==expected.date_precision))
   fail("IMMUTABLE_SOURCE_CLOCK_CHANGED");
  const state=!old?"newly_observed":
    JSON.stringify(old)===JSON.stringify(expected)?"unchanged_observed":"updated_observed";
  counts[expected.category].acknowledged++;
  counts[expected.category][state]++;
  counts[expected.category].independent_get_matched++;
  ids.push({
   id:expected.id,
   id_sha256:hash(expected.id),
   category:expected.category,
   state,
   published_at:expected.published_at,
   date_precision:expected.date_precision,
   payload_sha256:hash(JSON.stringify(expected)),
   previous_payload_sha256:old?hash(JSON.stringify(old)):null,
   independent_get_exact_match:true,
   native_publication_time_preserved:true,
   rights_verified:false,
   paid_eligible:false
  });
 }
 ids.sort((a,b)=>a.category.localeCompare(b.category)||a.id.localeCompare(b.id));
 return Object.freeze({
  schema:"geomacro.phase2g-per-id-d1-reconciliation.v1",
  source_sha:sourceSha,
  checked_at:new Date(now).toISOString(),
  classification:"BEFORE_AFTER_CANONICAL_D1_SNAPSHOTS",
  sqlite_physical_change_counters_not_inferred:true,
  source_native_originals_not_retimestamped:true,
  actual_acknowledged_ids:ids.length,
  complete_independent_get:true,
  counts,
  ids,
  source_urls_stored:false,
  upstream_articles_stored:false,
  commercial_rights_verified:false,
  paid_eligible:false,
  predge_modified:false,
  payments:0
 });
}
