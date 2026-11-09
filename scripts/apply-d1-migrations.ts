#!/usr/bin/env node
/** GeoMacro reviewed D1 0204–0211 runner. No unreviewed schema or quota bypass. */
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {assertOfficialMain,api,canonicalD1,need,queryD1,signedReport,holdError,persist} from './release-common.ts';
import {REPAIR_PLANS,REPAIR_SCHEMA_OBJECTS,verifyRepairSql} from './ops/protected-d1-repair-plan.mjs';
import {runProtectedD1Repair} from './ops/run-protected-d1-repair.mjs';
import {checkD1BundledWork} from './ops/plan-d1-bundled-work.mjs';
import {checkD1PaidMonthlyHeadroom} from './lib/d1-workers-paid-monthly-governor.mjs';
import {verifyCanaryPaidMonthQuota} from './ops/verify-protected-worker-promotion.mjs';
import {evaluateMigrationBudget} from './ops/verify-protected-d1-migration-gate.mjs';

const REPORT='artifacts/release/d1-schema-acceptance.json';
const CONFIG='workers/control-plane/wrangler.canary-d1.jsonc';
const HOT_QUERIES=[
 {table:'private_osint_news_25h',index:'idx_private_osint_country_category_clock_v2',sql:"SELECT item_id FROM private_osint_news_25h WHERE country_iso3='USA' AND category='geopolitics' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 10"},
 {table:'private_osint_source_checks_24h',index:'idx_private_osint_check_category_status_v2',sql:"SELECT source_ref FROM private_osint_source_checks_24h WHERE category='geopolitics' ORDER BY checked_at DESC LIMIT 10"},
 // Migration 0017 already provides this exact, narrower ordered index. SQLite
 // correctly selected it in provider run #42415525486. The newer, broader
 // v2 index is separately required by REPAIR_SCHEMA_OBJECTS, but natural
 // plan selection of the verified equivalent must not be marked a failure.
 {table:'website_derived_intelligence',index:'idx_website_derived_intelligence_latest',sql:'SELECT id FROM website_derived_intelligence ORDER BY published_at DESC,id DESC LIMIT 10'},
 {table:'source_registry',index:'idx_p1_dispatch_due',sql:"SELECT source_id FROM source_registry WHERE enabled=1 AND next_poll_at<'9999-01-01' ORDER BY next_poll_at,source_id LIMIT 10"},
];
function verifiedSql():void{
 need(REPAIR_PLANS.length===8&&REPAIR_PLANS[0].file.startsWith('0204_')&&REPAIR_PLANS[7].file.startsWith('0211_'),'RELEASE_MIGRATION_SET_INVALID');
 for(const p of REPAIR_PLANS)verifyRepairSql(p,readFileSync(`workers/control-plane/migrations/${p.file}`,'utf8'));
}
function verifyRunnerConfig(uuid:string){
 if(!existsSync(CONFIG)){
  // Create D1-only ephemeral runtime config from reviewed original template.
  const original=JSON.parse(readFileSync('workers/control-plane/wrangler.example.jsonc','utf8'));
  const db=original.d1_databases?.filter((x:any)=>x.binding==='DB'&&x.database_name==='geomacro-control-plane');
  need(db?.length===1,'RELEASE_D1_TEMPLATE_UNVERIFIED');
  const output={name:original.name,main:original.main,compatibility_date:original.compatibility_date,
   d1_databases:[{...db[0],database_id:uuid}]};
  writeFileSync(CONFIG,JSON.stringify(output)+'\n',{mode:0o600});
 }
 const conf=JSON.parse(readFileSync(CONFIG,'utf8'));
 need(conf.d1_databases?.length===1&&conf.d1_databases[0].binding==='DB'&&conf.d1_databases[0].database_name==='geomacro-control-plane'&&conf.d1_databases[0].database_id===uuid&&
  !conf.routes&&!conf.queues,'RELEASE_MIGRATION_D1_ONLY_CONFIG_REQUIRED');
}
async function verifySchema(uuid:string):Promise<Record<string,unknown>>{
 const want=Object.values(REPAIR_SCHEMA_OBJECTS).flat();
 const names=want.map(s=>`'${s}'`).join(',');
 const actual=await queryD1(uuid,`SELECT name FROM sqlite_master WHERE name IN (${names})`);
 const got=new Set(actual.rows.map(x=>x.name));
 need(got.size===want.length&&want.every(n=>got.has(n)),'RELEASE_SCHEMA_OBJECTS_INCOMPLETE');
 const history=await queryD1(uuid,"SELECT name FROM d1_migrations WHERE name >= '0204_' AND name < '0212_' ORDER BY name");
 const found=history.rows.map(x=>x.name);
 need(found.length===8&&REPAIR_PLANS.every(p=>found.includes(p.file)),'RELEASE_MIGRATION_HISTORY_NOT_COMPLETE');
 const probes=[];let chargedRows=actual.meta.rows_read+history.meta.rows_read;
 for(const h of HOT_QUERIES){
  const list=await queryD1(uuid,`PRAGMA index_list('${h.table}')`);
  const defined=list.rows.some(x=>x.name===h.index);
  need(defined,`RELEASE_HOT_INDEX_MISSING_${h.table.toUpperCase()}`);
  if(h.table==='website_derived_intelligence'){
   // Require physical SQLite btree key shape, not just an index with a
   // matching name. PRAGMA index_xinfo key=1 are indexed key columns; desc=1
   // verifies descending ordering for both published_at and id.
   const keyInfo=await queryD1(uuid,`PRAGMA index_xinfo('${h.index}')`);
   const keys=keyInfo.rows.filter(x=>x.key===1).sort((a,b)=>a.seqno-b.seqno);
   need(keys.length===2&&keys[0].name==='published_at'&&keys[1].name==='id'&&
    keys[0].desc===1&&keys[1].desc===1,
    'RELEASE_WEBSITE_NATIVE_ORDER_INDEX_SHAPE_INVALID');
   chargedRows+=keyInfo.meta.rows_read;
  }
  const explain=await queryD1(uuid,`EXPLAIN QUERY PLAN ${h.sql}`);
  const plans=explain.rows.map(r=>String(r.detail??''));
  if(!plans.some(x=>x.includes(h.index))){
   // An index can physically exist while SQLite chooses a different access
   // path on real data (or due to stale statistics). Preserve HOLD; do not
   // forge the expected EXPLAIN result or infer that migrations are absent.
   // Capture only EXPLAIN operation/index names, never SQL parameters, rows,
   // original news, account identifiers, credentials, or source bodies.
   const planner=plans.map(detail=>({
    operation:/\bSCAN\b/iu.test(detail)?'SCAN':/\bSEARCH\b/iu.test(detail)?'SEARCH':'OTHER',
    used_index:/\bUSING (?:COVERING )?INDEX ([A-Za-z0-9_]+)/iu.exec(detail)?.[1]??null,
   }));
   persist('artifacts/release/d1-hot-query-plan-diagnostic.json',{
    schema:'geomacro.d1-hot-query-physical-plan-hold.v1',
    status:'HOLD',verified_at:new Date().toISOString(),
    table:h.table,expected_index:h.index,actual_provider_planner:planner,
    index_physically_present:true,required_expected_index_not_selected:true,
    no_migration_history_rollback_inferred:true,provider_rows_read:explain.meta.rows_read,
    database_modified:false,no_funds:true
   });
   throw Error('RELEASE_HOT_QUERY_NOT_INDEXED_'+h.table.toUpperCase());
  }
  chargedRows+=list.meta.rows_read+explain.meta.rows_read;
  probes.push({table:h.table,index:h.index,index_present:true,explain_uses_index:true,details_sha256:await import('node:crypto').then(m=>m.createHash('sha256').update(plans.join('\n')).digest('hex'))});
 }
 return {schema_object_count:got.size,migrations_verified:found,original_sql_hashes:REPAIR_PLANS.map(p=>({name:p.file,sha256:p.sha256})),hot_query_plans:probes,physical_readback_rows_read:chargedRows,physical_readback_rows_written:0};
}
async function main(){
 const apply=process.argv.includes('--apply');
 need(process.argv.slice(2).every(a=>['--apply','--verify'].includes(a)),'RELEASE_D1_BAD_ARGS');
 verifiedSql();const mainSha=assertOfficialMain();
 const db=await canonicalD1();verifyRunnerConfig(db.uuid);
 const bookmark=await api(`/d1/database/${db.uuid}/time_travel/bookmark`);
 need(/^[a-f0-9-]{20,100}$/i.test(bookmark.bookmark??''),'RELEASE_D1_TIME_TRAVEL_UNVERIFIED');
 // Same account-wide Paid billing-cycle governor as protected Step3/Step4.
 // Retired 140k daily bundled-work policy cannot veto READ-ONLY --verify.
 const quota=await checkD1PaidMonthlyHeadroom({env:process.env,lane:'canary'});
 const monthly=verifyCanaryPaidMonthQuota(quota,new Date());
 need(monthly.verified===true,'RELEASE_PAID_MONTHLY_PROVIDER_SCHEMA_HEADROOM_HOLD');
 let mutation:{completed:string[]}|null=null;
 if(apply){
  need(existsSync('config/d1-hotspot-v2-canary.hold'),'RELEASE_PROTECTED_CANARY_HOLD_MISSING');
  // Independent legacy mutation safety gate remains mandatory.
  // Production four-migration Stage2 is separately protected and signed.
  const legacy=await checkD1BundledWork();
  need(legacy.workers_paid_subscription_verified===true,'RELEASE_LEGACY_MIGRATION_PAID_UNVERIFIED');
  const allowance=evaluateMigrationBudget(legacy);
  need(allowance.admitted===true,'RELEASE_D1_MIGRATION_80K_HEADROOM_UNAVAILABLE');
  // The existing pinned migration runner executes ONE original SQL file at a
  // time with fresh provider budget, Time Travel bookmark and exact-main check.
  mutation=await runProtectedD1Repair();
 }
 const proof=await verifySchema(db.uuid);
 const payload={schema:'geomacro.d1-0204-0211.schema-acceptance.v1',status:'PASS',verified_at:new Date().toISOString(),release_sha:mainSha,
  database_name:'geomacro-control-plane',database_uuid:db.uuid,storage_file_size_bytes:db.file_size,
  time_travel_bookmark_sha256:(await import('node:crypto')).createHash('sha256').update(bookmark.bookmark).digest('hex'),
  migrations_applied_this_run:mutation?.completed??[],...proof,
  paid_monthly_subscription_verified:true,
  paid_monthly_billing_cycle_verified:true,
  paid_monthly_cycle_start_utc:monthly.cycle_start_utc,
  paid_monthly_cycle_end_exclusive_utc:monthly.cycle_end_exclusive_utc,
  paid_monthly_provider_checked_at_utc:quota.checked_at_utc,
  provider_account_wide_d1_usage_observed:quota.database_count>=1,
  old_daily_140k_policy_applied:false,provider_metrics_are_delayed:true,
  source_version_deployed:false,traffic_promoted:false,payments_authorized:false,
  signed_envelope_integrity_not_external_certification:true};
 signedReport(REPORT,payload);
 console.log(JSON.stringify({status:'PASS',report:REPORT,migrations:proof.migrations_verified}));
}
main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),report_not_accepted:true}));process.exitCode=2});