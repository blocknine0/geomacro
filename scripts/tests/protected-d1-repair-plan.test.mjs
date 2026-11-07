import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {REPAIR_PLANS,REPAIR_SCHEMA_OBJECTS,pendingRepairPlans,verifyRepairSql,
 repairProbeSql,verifyRepairProbe,admitRepairCost,verifyRepairSchema} from '../ops/protected-d1-repair-plan.mjs';
import {runProtectedD1Repair} from '../ops/run-protected-d1-repair.mjs';
const root=resolve('.');
const provider=(results,rows_read=10)=>[{success:true,results,meta:{rows_read,rows_written:0}}];
test('only hash-pinned reviewed chain accepted; unknown/staged migration still refused',()=>{
 assert.equal(pendingRepairPlans(REPAIR_PLANS.map(p=>p.file).join('\n')).length,8);
 for(const s of ['', 'unknown','0212_storage_directory_read_model.sql',REPAIR_PLANS[0].file+'\n0001_core.sql'])
  assert.throws(()=>pendingRepairPlans(s),/REPAIR_/);
 for(const p of REPAIR_PLANS){
  const sql=readFileSync(join(root,'workers/control-plane/migrations',p.file),'utf8');
  verifyRepairSql(p,sql);
  assert.throws(()=>verifyRepairSql(p,sql+'\n'),/REVISION_CHANGED/);
 }
});
test('missing prerequisites, oversize tables, missing billing proof and extra writes block DDL',()=>{
 const p=REPAIR_PLANS[7];
 assert.throws(()=>repairProbeSql(p,[]),/PREREQUISITE/);
 assert.equal(repairProbeSql(REPAIR_PLANS[1],[]),null);
 assert.match(repairProbeSql(p,['ingestion_spool_queue']),/OFFSET 12000/);
 verifyRepairProbe(p,['ingestion_spool_queue'],provider([{ingestion_spool_queue_over:0}],12001));
 for(const doc of [provider([{ingestion_spool_queue_over:1}]),provider([{}]),provider([{ingestion_spool_queue_over:0}],12002),
  [{success:true,results:[{ingestion_spool_queue_over:0}],meta:{rows_read:1,rows_written:1}}]])
  assert.throws(()=>verifyRepairProbe(p,['ingestion_spool_queue'],doc),/BOUND/);
});
test('large Phase2H repeated seed scans require more than the bare 80k reserve',()=>{
 const p=REPAIR_PLANS[4];
 assert.throws(()=>admitRepairCost(p,{admitted:true,headroom_read:80000,headroom_write:80000}),/COST_HEADROOM/);
 assert.equal(admitRepairCost(p,{admitted:true,headroom_read:130000,headroom_write:130000}).rows_read,116000);
 assert.throws(()=>admitRepairCost(p,{admitted:false,headroom_read:140000,headroom_write:140000}));
 assert.throws(()=>verifyRepairSchema(p,provider([{name:'phase2h_archive_totals'}])),/SCHEMA/);
});
function harness({stopAfterApply=false,unknown=false,moved=false,failSchema=false}={}){
 const tmp=mkdtempSync(join(tmpdir(),'geomacro-repair-test-'));
 mkdirSync(join(tmp,'config'));writeFileSync(join(tmp,'config/d1-hotspot-v2-canary.hold'),'HOLD');
 mkdirSync(join(tmp,'workers/control-plane/migrations'),{recursive:true});
 for(const p of REPAIR_PLANS)writeFileSync(join(tmp,'workers/control-plane/migrations',p.file),readFileSync(join(root,'workers/control-plane/migrations',p.file)));
 writeFileSync(join(tmp,'workers/control-plane/wrangler.canary-d1.jsonc'),JSON.stringify({compatibility_date:'2026-10-03',d1_databases:[{binding:'DB',database_name:'geomacro-control-plane',database_id:'db057ca9-9f6e-4957-ac28-144f3b798f9b'}]}));
 const sha='a'.repeat(40),applied=[],remaining=unknown?['0212_storage_directory_read_model.sql']:[REPAIR_PLANS[4].file,REPAIR_PLANS[7].file];
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'blocknine0/geomacro',GITHUB_REF:'refs/heads/main',GITHUB_SHA:sha,RUNNER_TEMP:tmp,WRANGLER_VERSION:'4.136.3'};
 let probes=0,budgetCalls=0;
 const plan=async()=>{budgetCalls++;return {day_utc:new Date().toISOString().slice(0,10),workers_paid_subscription_verified:true,
  owner_d1_normal_envelope:{held:false},critical:true,observed_rows_read:stopAfterApply&&applied.length?65000:5000,observed_rows_written:5000,
  owner_d1_utc_daily_targets:{rows_read:140000,normal_rows_written:140000,emergency_auto_admission:false}}};
 const run=(cmd,args)=>{
  if(cmd==='git')return args[0]==='ls-remote'?(moved?'b'.repeat(40):sha)+'\trefs/heads/main':sha;
  const cfg=args[args.indexOf('--config')+1];
  if(args.includes('migrations')){
   const single=cfg.endsWith('/wrangler.json');
   const file=single?readdirSync(JSON.parse(readFileSync(cfg)).d1_databases[0].migrations_dir).find(x=>x.endsWith('.sql')):null;
   if(args.includes('apply')){assert.ok(single);assert.equal(probes,applied.length+1);applied.push(file);remaining.splice(remaining.indexOf(file),1);return 'Applied';}
   const pending=single?remaining.filter(x=>x===file):remaining;
   return pending.length?pending.join('\n'):'No migrations to apply!';
  }
  if(args.includes('time-travel'))return JSON.stringify({bookmark:'00000001-00000002-00000003-abcdefabcdef123456789abc'});
  if(args.includes('info'))return JSON.stringify({version:'production'});
  const sql=args[args.indexOf('--command')+1];
  if(sql.startsWith('SELECT name FROM sqlite_schema WHERE type')){
   const p=REPAIR_PLANS.find(p=>p.file===remaining[0]);return JSON.stringify(provider(Object.keys(p.tables).map(name=>({name}))));
  }
  if(sql.includes('EXISTS(')){probes++;const p=REPAIR_PLANS.find(p=>p.file===remaining[0]);return JSON.stringify(provider([Object.fromEntries(Object.keys(p.tables).map(t=>[t+'_over',0]))]));}
  const p=REPAIR_PLANS.find(p=>p.file===applied.at(-1));
  return JSON.stringify(provider((failSchema?[]:REPAIR_SCHEMA_OBJECTS[p.file.slice(0,4)]).map(name=>({name}))));
 };
 return {tmp,env,plan,run,applied,budgets:()=>budgetCalls};
}
test('runner applies each original separately and verifies history/schema, with repeated fresh quota',async()=>{
 const h=harness();process.chdir(h.tmp);
 try{const result=await runProtectedD1Repair(h);assert.equal(result.completed.length,2);assert.equal(result.worker_uploaded,false);assert.equal(h.applied.length,2);assert.ok(h.budgets()>=9);}
 finally{process.chdir(root);rmSync(h.tmp,{recursive:true,force:true});}
});
test('unknown pending migration or moved main cannot write; exhausted budget/schema failure stops next migration',async()=>{
 for(const scenario of [{unknown:true},{moved:true},{stopAfterApply:true},{failSchema:true}]){
  const h=harness(scenario);process.chdir(h.tmp);
  try{await assert.rejects(runProtectedD1Repair(h),/REPAIR_/);assert.equal(h.applied.length,scenario.stopAfterApply||scenario.failSchema?1:0);}
  finally{process.chdir(root);rmSync(h.tmp,{recursive:true,force:true});}
 }
});
