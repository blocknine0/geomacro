/** Reviewed, bounded repair plan. Never marks a skipped migration applied. */
import {createHash} from 'node:crypto';
export const REPAIR_PLANS=Object.freeze([
 ['0204_d1_read_hotspot_optimization.sql','ddc7601f010bb9d5d80a3019cdfd0379bb3ded8eff64b32429d0569614d87177',
  {private_osint_news_25h:3000,private_osint_source_checks_24h:3000,website_derived_intelligence:3000},2,3],
 ['0205_unified_event_stream.sql','e0d9b31927f2d83920a0cdcd4a80490e89da4f611e7008fb7e43ad04ad0397cc',{events:3000},3,9],
 ['0206_d1_poll_index_write_relief.sql','f995c9cb67a2d52c014a84abe1f36621fef94040a3b3ac0edb7df7409aea13d3',{source_registry:3000,ingestion_spool_queue:12000},1,6],
 ['0207_hot50_bounded_enrichment_reads.sql','bd2298b87aebfd983058d52c5269d549809d6f7f9e969f2a7c228af496a8415c',{unverified_observations:3000,risk_observations:3000},1,3],
 ['0208_phase2h_atomic_archive_census.sql','6df1d982e63e8c0fdc91d376ae5e3eff5ddbefafe7f5b64a2cf2ebcf4124d3c8',{phase2h_private_raw_news:12000},8,4],
 ['0209_hot50_indexed_readonly_views.sql','f642ab0a052d57919981f2ec3f8a0ff37354a5fcc619c1f32bb105e82a91af92',{},0,0],
 ['0210_p0b_immutable_source_fk_index.sql','75b304c8585d0e083398f7f1dd843783a8b4cab6683d502a05f9560c4eb79726',{ingestion_spool_queue:12000},1,6],
 ['0211_p0b_daily_committed_count.sql','3714cb9d334c2de8c7a4579a4f950de2342e3ed4fd335e1ea2d5dc9833c39681',{ingestion_spool_queue:12000},1,3],
].map(([file,sha256,tables,readFactor,writeFactor])=>Object.freeze({file,sha256,
 tables:Object.freeze(tables),readFactor,writeFactor})));
export function pendingRepairPlans(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.length>65536)throw Error('REPAIR_PENDING_UNVERIFIED');
 const files=[...new Set(raw.match(/\b[0-9]{4}_[A-Za-z0-9_-]+\.sql\b/gu)??[])];
 if(!files.length&&!/no migrations to apply/i.test(raw))throw Error('REPAIR_PENDING_UNVERIFIED');
 if(files.some(f=>!REPAIR_PLANS.some(p=>p.file===f)))throw Error('REPAIR_UNREVIEWED_PENDING');
 return REPAIR_PLANS.filter(p=>files.includes(p.file));
}
export function verifyRepairSql(plan,sql){
 if(!REPAIR_PLANS.includes(plan)||createHash('sha256').update(sql).digest('hex')!==plan.sha256)
  throw Error('REPAIR_SQL_REVISION_CHANGED');
}
/** Probe table existence first: 0205 creates a table which may not exist yet. */
export function repairProbeSql(plan,present){
 if(!REPAIR_PLANS.includes(plan)||!Array.isArray(present))throw Error('REPAIR_PLAN_UNVERIFIED');
 const tables=Object.keys(plan.tables);
 if(tables.some(t=>t!=='events'&&!present.includes(t)))throw Error('REPAIR_PREREQUISITE_TABLE_MISSING');
 const probes=tables.filter(t=>present.includes(t)).map(t=>
  `EXISTS(SELECT 1 FROM ${t} LIMIT 1 OFFSET ${plan.tables[t]}) AS ${t}_over`);
 return probes.length?'SELECT '+probes.join(', '):null;
}
export function verifyRepairProbe(plan,present,doc){
 const sql=repairProbeSql(plan,present);
 if(sql===null)return;
 const batches=Array.isArray(doc)?doc:[doc];
 const b=batches[0],keys=Object.keys(plan.tables).filter(t=>present.includes(t)).map(t=>t+'_over');
 const maxRead=Object.entries(plan.tables).filter(([t])=>present.includes(t)).reduce((n,[,cap])=>n+cap+1,0);
 if(batches.length!==1||b?.success!==true||b.results?.length!==1||
    !b.meta||!Number.isSafeInteger(b.meta.rows_read)||b.meta.rows_read<0||
    b.meta.rows_read>maxRead||b.meta.rows_written!==0||
    Object.keys(b.results[0]).length!==keys.length||keys.some(k=>b.results[0][k]!==0))
  throw Error('REPAIR_TABLE_BOUND_UNVERIFIED');
}
export function repairCostEnvelope(plan){
 if(!REPAIR_PLANS.includes(plan))throw Error('REPAIR_PLAN_UNVERIFIED');
 const bound=Object.values(plan.tables).reduce((a,b)=>a+b,0);
 // Includes index rebuild/removal and seed overhead; not a provider hard cap.
 return {rows_read:bound*plan.readFactor+20000,rows_written:bound*plan.writeFactor+20000};
}
export function admitRepairCost(plan,budget){
 const cost=repairCostEnvelope(plan);
 if(budget?.admitted!==true||!Number.isSafeInteger(budget.headroom_read)||
    !Number.isSafeInteger(budget.headroom_write)||budget.headroom_read<cost.rows_read||
    budget.headroom_write<cost.rows_written)throw Error('REPAIR_COST_HEADROOM_UNAVAILABLE');
 return cost;
}
export const REPAIR_SCHEMA_OBJECTS=Object.freeze({
 '0204':['materialized_cache','idx_private_osint_country_category_clock_v2','idx_private_osint_check_category_status_v2','idx_website_derived_hot_order_v2'],
 '0205':['events','unified_event_archive_slots','idx_events_lookup','idx_events_credibility','idx_events_archive_pending'],
 '0206':['idx_p1_dispatch_due'],
 '0207':['idx_unverified_hot50_country_discovered','idx_risk_obs_hot50_country_created'],
 '0208':['phase2h_archive_totals','idx_phase2h_pending_recent_ingested_category','trg_phase2h_census_insert','trg_phase2h_census_delete','trg_phase2h_census_ack','trg_phase2h_census_no_category_rewrite'],
 '0209':['v_p0b_unhandled_activation','v_hot50_three_category_evidence'],
 '0210':['idx_spool_source_id'],
 '0211':['p0b_committed_day_totals','trg_p0b_day_committed_insert','trg_p0b_day_committed_delete','trg_p0b_day_committed_clock_change'],
});
export function verifyRepairSchema(plan,doc){
 const expected=REPAIR_SCHEMA_OBJECTS[plan.file.slice(0,4)];
 const batches=Array.isArray(doc)?doc:[doc],b=batches[0];
 if(!expected||batches.length!==1||b?.success!==true||!Array.isArray(b.results)||
    b.meta?.rows_written!==0||!Number.isSafeInteger(b.meta?.rows_read)||b.meta.rows_read<0||b.meta.rows_read>2000||
    b.results.length!==expected.length||new Set(b.results.map(x=>x.name)).size!==expected.length||
    expected.some(name=>!b.results.some(x=>x.name===name)))throw Error('REPAIR_SCHEMA_READBACK_FAILED');
}
