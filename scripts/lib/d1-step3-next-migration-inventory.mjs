/**
 * Read-only, zero-funds, next-Step3 D1 migration reconnaissance.
 * Source tables must be physically bounded before any 0211/0212 DDL;
 * this inventory never grants migration, payment, or canary authorization.
 * Every result is provider-metered, normalized, and free of private rows.
 */
export const STEP3_NEXT_PROBE_MAX_ROWS=32;
const migrations=Object.freeze([
 "0204_d1_read_hotspot_optimization.sql",
 "0211_p0b_daily_committed_count.sql",
 "0212_d1_keyset_hourly_pending_census.sql",
 "0213_phase2h_raw_ref_only_v1.sql"
]);
const tables=Object.freeze([
 "ingestion_spool_queue","phase2h_private_raw_news",
 "p0b_committed_day_totals","phase2h_pending_hourly_v1",
 "phase2h_raw_object_refs_v1"
]);
const objects=Object.freeze([
 ...tables,"_geomacro_migration_ledger",
 "trg_p0b_day_committed_insert","trg_p0b_day_committed_delete",
 "trg_p0b_day_committed_clock_change",
 "trg_phase2h_hourly_pending_insert_v1",
 "trg_phase2h_hourly_pending_delete_v1",
 "trg_phase2h_hourly_pending_ack_v1",
 "trg_phase2h_hourly_pending_reversal_v1",
 "trg_phase2h_hourly_first_seen_immutable_v1",
 "idx_private_osint_country_clock_v3",
 "idx_website_derived_category_clock_v3",
 "idx_phase2h_ref_object_key_v1",
 "idx_phase2h_ref_country_category_clock_v1",
 "idx_phase2h_ref_ingest_clock_v1"
]);
const quote=x=>"'"+x+"'";
const ident=x=>'"'+x+'"';
export const STEP3_NEXT_STAGE_READONLY_PROBES=Object.freeze([
 Object.freeze({id:"native_history_4",kind:"native",
  sql:"SELECT name FROM d1_migrations WHERE name IN ("+
   migrations.map(quote).join(",")+") ORDER BY name LIMIT 5",maxRows:5}),
 Object.freeze({id:"ledger_4",kind:"ledger",
  sql:"SELECT migration_id,status FROM _geomacro_migration_ledger "+
   "WHERE migration_id IN ('0204','0211','0212','0213') "+
   "ORDER BY migration_id LIMIT 5",maxRows:5}),
 Object.freeze({id:"next_schema",kind:"schema",
  sql:"SELECT type,name,sql FROM sqlite_schema WHERE name IN ("+
   objects.map(quote).join(",")+") ORDER BY name LIMIT 25",maxRows:25}),
 ...tables.map(table=>Object.freeze({id:"cap_"+table,kind:"capacity",table,
  sql:"SELECT EXISTS(SELECT 1 FROM "+ident(table)+
   " LIMIT 1) AS has_row, EXISTS(SELECT 1 FROM "+ident(table)+
   " LIMIT 1 OFFSET 3000) AS over_3000",maxRows:1})),
 ...tables.map(table=>Object.freeze({id:"indexes_"+table,kind:"indexes",table,
  sql:"PRAGMA index_list("+quote(table)+")",maxRows:STEP3_NEXT_PROBE_MAX_ROWS}))
]);
const fail=why=>{throw Error("STEP3_NEXT_STAGE_"+why)};
const expectedIds=new Set(STEP3_NEXT_STAGE_READONLY_PROBES.map(x=>x.id));
const safeObjectNames=new Set(objects);
const safeMigrations=new Set(migrations);
const ids=new Set(["0204","0211","0212","0213"]);
export function verifyStep3NextReadonlyPlan(plan=STEP3_NEXT_STAGE_READONLY_PROBES){
 if(!Array.isArray(plan)||plan.length!==13||
    new Set(plan.map(x=>x.id)).size!==plan.length||
    plan.some(p=>!expectedIds.has(p.id)||
     p.sql!==STEP3_NEXT_STAGE_READONLY_PROBES.find(x=>x.id===p.id)?.sql||
     !Number.isSafeInteger(p.maxRows)||p.maxRows<1||p.maxRows>32||
     !/^(?:SELECT |PRAGMA index_list\()/.test(p.sql)||
     /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|VACUUM|REINDEX)\b/i.test(p.sql)))
   fail("READONLY_ALLOWLIST_CHANGED");
 return true;
}
export function summarizeStep3NextProbe(probe,rows){
 if(!expectedIds.has(probe?.id)||!Array.isArray(rows)||
    rows.length>probe.maxRows)fail("PROVIDER_ROWSET_UNVERIFIED");
 if(probe.kind==="capacity"){
  if(rows.length!==1||![0,1].includes(rows[0]?.has_row)||
     ![0,1].includes(rows[0]?.over_3000)||
     (rows[0].over_3000===1&&rows[0].has_row!==1)||
     Object.keys(rows[0]).sort().join(",")!=="has_row,over_3000")
   fail("CAPACITY_RESULT_UNVERIFIED");
  return Object.freeze({id:probe.id,status:rows[0].over_3000===1?
   "HOLD_SOURCE_EXCEEDS_3000_STAGED_DDL_ROWS":"OBSERVED_BOUNDED",
   table:probe.table,nonempty:rows[0].has_row===1,
   beyond_3000:rows[0].over_3000===1,no_d1_writes:true});
 }
 if(probe.kind==="native"){
  if(new Set(rows.map(x=>x.name)).size!==rows.length||
     rows.some(x=>!safeMigrations.has(x?.name)||Object.keys(x).join()!=="name"))
   fail("NATIVE_MIGRATION_HISTORY_UNVERIFIED");
  return Object.freeze({id:probe.id,status:"OBSERVED_NATIVE_HISTORY",
   present_migrations:rows.map(x=>x.name).sort(),no_d1_writes:true});
 }
 if(probe.kind==="ledger"){
  if(new Set(rows.map(x=>x.migration_id)).size!==rows.length||
     rows.some(x=>!ids.has(x?.migration_id)||
      !["STARTED","APPLIED","VERIFIED"].includes(x?.status)||
      Object.keys(x).sort().join(",")!=="migration_id,status"))
   fail("LEDGER_STATUS_UNVERIFIED");
  return Object.freeze({id:probe.id,status:"OBSERVED_LEDGER",
   entries:rows.map(x=>({id:x.migration_id,status:x.status})),no_d1_writes:true});
 }
 if(probe.kind==="schema"){
  if(new Set(rows.map(x=>x.name)).size!==rows.length||
     rows.some(x=>!safeObjectNames.has(x?.name)||
      !["table","index","trigger"].includes(x.type)||
      typeof x.sql!=="string"||x.sql.length<12||
      Object.keys(x).sort().join(",")!=="name,sql,type"))
   fail("SCHEMA_RESULT_UNVERIFIED");
  return Object.freeze({id:probe.id,status:"OBSERVED_SCHEMA",
   objects:rows.map(x=>({name:x.name,type:x.type,
    without_rowid:x.type==="table"&&/\bWITHOUT\s+ROWID\b/i.test(x.sql)})),
   no_d1_writes:true});
 }
 if(probe.kind==="indexes"){
  if(new Set(rows.map(x=>x.name)).size!==rows.length||
     rows.some(x=>typeof x.name!=="string"||
      !/^(?:sqlite_autoindex_|idx_)[a-z0-9_]{3,95}$/.test(x.name)||
      ![0,1].includes(x.unique)||![0,1].includes(x.partial)||
      !["c","u","pk"].includes(x.origin)||
      !Number.isSafeInteger(x.seq)))
   fail("INDEX_CATALOG_UNVERIFIED");
  return Object.freeze({id:probe.id,status:"OBSERVED_INDEX_CATALOG",
   table:probe.table,index_count:rows.length,
   index_names:rows.map(x=>x.name).sort(),
   has_partial:rows.some(x=>x.partial===1),
   has_unique:rows.some(x=>x.unique===1),
   no_d1_writes:true});
 }
 fail("PROBE_KIND_UNRECOGNIZED");
}
export function classifyStep3NextStageReadiness(observations){
 if(!Array.isArray(observations)||observations.length!==13)
  return Object.freeze({status:"HOLD",reason:"NEXT_STAGE_READONLY_PROOFS_INCOMPLETE",
   stage2_authorized:false,canary_promoted:false});
 const by=new Map(observations.map(x=>[x.id,x]));
 if(by.size!==13||STEP3_NEXT_STAGE_READONLY_PROBES.some(p=>
    !by.has(p.id)||by.get(p.id).status?.startsWith("HOLD")||
    by.get(p.id).status?.startsWith("PROVIDER_")||
    by.get(p.id).status===undefined))
  return Object.freeze({status:"HOLD",reason:"NEXT_STAGE_MISSING_PROVIDER_OR_CAPACITY_EVIDENCE",
   stage2_authorized:false,canary_promoted:false});
 const ledger=by.get("ledger_4")?.entries??[];
 const applied0204=ledger.some(x=>x.id==="0204"&&x.status==="APPLIED");
 return Object.freeze({status:"OBSERVED_ONLY",
  reason:applied0204?"0204_LEDGER_RECONCILIATION_PENDING":"NEXT_STAGE_SCHEMA_AND_SIZE_INVENTORIED",
  source_table_capacity_acceptable:tables.slice(0,2).every(t=>
   by.get("cap_"+t)?.status==="OBSERVED_BOUNDED"),
  next_step3_ddl_provider_verified:false,
  migration_integrity_certificate:false,
  stage2_authorized:false,canary_promoted:false});
}
