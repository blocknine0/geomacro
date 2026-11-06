/**
 * Self-healing priority scheduler. One bounded D1 read, 10-way in-memory
 * partitioning, one bundled 12-cell D1 queue upsert per 20-minute tick.
 * The actual search worker consumes the due queue; no extra provider cron.
 */
import {PHASE2H_COUNTRIES_195} from "../../../scripts/lib/phase2h-country-originals-195.mjs";
import {DAILY_RG_CORRIDORS} from "./daily-risk-gate-generator.mjs";
import {CATEGORIES} from "./unified-risk-categories.mjs";
import {hot50RiskGateEnabled,isHot50RiskCountry} from "./risk-gate-hot50-scope.mjs";
import {runRiskGatePartitioned} from "./risk-gate-partitioned-concurrency.mjs";
const iso=n=>new Date(n).toISOString();
const DAY=86400000,STEP=20*60000;
const allSubjects=Object.freeze([
 ...PHASE2H_COUNTRIES_195.map(x=>({type:"COUNTRY",id:x.iso3})),
 ...DAILY_RG_CORRIDORS.map(x=>({type:"CORRIDOR",id:x.id})),
]);
if(allSubjects.length!==207)throw Error("RISK_GATE_WATCHDOG_CANONICAL_NODE_DRIFT");
export async function runRiskGateIncompleteWatchdog(env,{now=Date.now()}={}){
 if(!env?.DB?.prepare||!Number.isFinite(now))
  return {ok:false,error:"RISK_WATCHDOG_D1_UNAVAILABLE"};
 try{
  const recent=await env.DB.prepare(
   "SELECT subject_type,subject_id,category,evidence_status,updated_at "+
   "FROM risk_gate_progressive_cell_state WHERE updated_at>=? LIMIT 700")
   .bind(iso(now-2*DAY)).all();
  if(!Array.isArray(recent?.results)||recent.results.length>621)
   throw Error("RISK_WATCHDOG_READBACK_INVALID");
  const indexed=new Map(recent.results.map(r=>[
   r.subject_type+"|"+r.subject_id+"|"+r.category,r]));
  const scoped=allSubjects.filter(x=>!hot50RiskGateEnabled(env)||
   x.type==="COUNTRY"&&isHot50RiskCountry(x.id));
  const partitions=await runRiskGatePartitioned(scoped,async subject=>
   CATEGORIES.map(category=>{
    const row=indexed.get(subject.type+"|"+subject.id+"|"+category);
    const stale=!row||!Number.isFinite(Date.parse(row.updated_at))||
     Date.parse(row.updated_at)<=now-DAY;
    return {subject_type:subject.type,subject_id:subject.id,category,
     priority:row?"STALE":"MISSING",needs_refresh:stale||
      row.evidence_status!=="CORROBORATED_ORIGINAL_EVIDENCE"};
   }));
  if(partitions.failed!==0)throw Error("RISK_WATCHDOG_PARTITION_FAILED");
  const pending=partitions.receipts.flatMap(r=>r.value).filter(r=>r.needs_refresh);
  const missing=pending.filter(r=>r.priority==="MISSING");
  const stale=pending.filter(r=>r.priority==="STALE");
  const slot=Math.floor(now/STEP);
  const rotating=(items,count)=>items.length?Array.from({length:Math.min(count,items.length)},(_,i)=>
   items[(slot*count+i)%items.length]):[];
  const chosen=[...rotating(missing,stale.length?6:12),...rotating(stale,missing.length?6:12)];
  const due=iso(now);
  const statement=chosen.length?env.DB.prepare(
   "INSERT INTO risk_gate_priority_feed_queue(subject_type,subject_id,category,"+
   "priority,priority_at,last_search_at,due_at,updated_at) "+
   "SELECT json_extract(value,'$.subject_type'),json_extract(value,'$.subject_id'),"+
   "json_extract(value,'$.category'),json_extract(value,'$.priority'),"+
   "?,NULL,?,? FROM json_each(?) WHERE 1 "+
   "ON CONFLICT(subject_type,subject_id,category) DO UPDATE SET "+
   "priority=excluded.priority,priority_at=excluded.priority_at,"+
   "due_at=CASE WHEN risk_gate_priority_feed_queue.due_at<=excluded.due_at "+
   "THEN excluded.due_at ELSE risk_gate_priority_feed_queue.due_at END,"+
   "updated_at=excluded.updated_at")
   .bind(due,due,due,JSON.stringify(chosen)):null;
  if(statement){const r=await statement.run();if(r?.success===false)throw Error("RISK_WATCHDOG_QUEUE_WRITE_FAILED");}
  return {ok:true,schema:"geomacro.risk-gate-incomplete-watchdog.v1",
   registered_subjects:allSubjects.length,active_subjects:scoped.length,
   partitions:partitions.partition_count,
   pending_cells:pending.length,missing_cells:missing.length,stale_cells:stale.length,
   priority_slots_enqueued:chosen.length,no_funds:true,no_source_bodies:true};
 }catch{return {ok:false,error:"RISK_GATE_WATCHDOG_FAILED"};}
}
