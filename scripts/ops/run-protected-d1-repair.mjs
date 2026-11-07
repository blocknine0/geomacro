#!/usr/bin/env node
/** One reviewed migration at a time, preserving Wrangler history and owner caps. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {evaluateMigrationBudget,checkTimeTravel} from './verify-protected-d1-migration-gate.mjs';
import {checkD1BundledWork} from './plan-d1-bundled-work.mjs';
import {REPAIR_SCHEMA_OBJECTS,verifyRepairSchema,pendingRepairPlans,verifyRepairSql,repairProbeSql,verifyRepairProbe,admitRepairCost} from './protected-d1-repair-plan.mjs';
export async function runProtectedD1Repair({env=process.env,run,plan=checkD1BundledWork,assessBudget=evaluateMigrationBudget}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||
    env.GITHUB_REF!=='refs/heads/main'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||
    !env.RUNNER_TEMP||env.WRANGLER_VERSION!=='4.136.3'||
    !existsSync('config/d1-hotspot-v2-canary.hold'))throw Error('REPAIR_IDENTITY_UNVERIFIED');
 const execute=run??((cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:4_000_000}));
 const receipts='artifacts/protected-canary';mkdirSync(receipts,{recursive:true,mode:0o700});
 const record=(name,value)=>{writeFileSync(join(receipts,'repair-'+name+'.json'),JSON.stringify(value)+'\n',{mode:0o600});};
 const exactMain=()=>{
  const head=execute('git',['rev-parse','HEAD']).trim();
  const upstream=execute('git',['ls-remote','https://github.com/blocknine0/geomacro.git','refs/heads/main']).trim().split(/\s+/)[0];
  if(head!==env.GITHUB_SHA||upstream!==head)throw Error('REPAIR_MAIN_MOVED');
 };
 const budget=async()=>{
  exactMain();
  const b=assessBudget(await plan({env}));
  record('budget',b);if(!b.admitted)throw Error('REPAIR_PROVIDER_BUDGET_HELD');return b;
 };
 const configPath=resolve('workers/control-plane/wrangler.canary-d1.jsonc');
 const original=JSON.parse(readFileSync(configPath,'utf8'));
 if(original.d1_databases?.length!==1||original.d1_databases[0].database_name!=='geomacro-control-plane'||
    !/^[a-f0-9-]{36}$/i.test(original.d1_databases[0].database_id??''))throw Error('REPAIR_CONFIG_UNVERIFIED');
 const wrangler=(config,args)=>execute('npx',['-y','wrangler@4.136.3',...args,'--config',config]);
 await budget();
 const pending=()=>pendingRepairPlans(wrangler(configPath,['d1','migrations','list','DB','--remote']));
 const planned=pending();
 const completed=[];
 for(const migration of planned){
  verifyRepairSql(migration,readFileSync('workers/control-plane/migrations/'+migration.file,'utf8'));
  // Every iteration checks exact main and fresh account-wide provider usage.
  await budget();
  const names=Object.keys(migration.tables);
  let present=[];
  if(names.length){
   const doc=JSON.parse(wrangler(configPath,['d1','execute','DB','--remote','--json','--command',
    "SELECT name FROM sqlite_schema WHERE type='table' AND name IN ("+names.map(n=>"'"+n+"'").join(',')+")"]));
   if(!Array.isArray(doc)||doc.length!==1||doc[0].success!==true||doc[0].meta?.rows_written!==0||
      !Number.isSafeInteger(doc[0].meta?.rows_read)||doc[0].meta.rows_read<0||doc[0].meta.rows_read>2000||
      !Array.isArray(doc[0].results))throw Error('REPAIR_SCHEMA_PROBE_UNVERIFIED');
   present=doc[0].results.map(x=>x.name);
  }
  const probe=repairProbeSql(migration,present);
  if(probe)verifyRepairProbe(migration,present,JSON.parse(wrangler(configPath,
   ['d1','execute','DB','--remote','--json','--command',probe])));
  const cost=admitRepairCost(migration,await budget());
  const info=wrangler(configPath,['d1','info','DB','--json']);
  const bookmark=wrangler(configPath,['d1','time-travel','info','DB','--json']);
  record(migration.file.slice(0,4)+'-backup',checkTimeTravel(info,bookmark));
  // The temporary directory contains ONE original, hash-pinned SQL file.
  // Wrangler records its original name in the same d1_migrations table.
  const dir=mkdtempSync(join(env.RUNNER_TEMP,'geomacro-d1-single-'));
  writeFileSync(join(dir,migration.file),readFileSync('workers/control-plane/migrations/'+migration.file));
  const single=join(dir,'wrangler.json');
  writeFileSync(single,JSON.stringify({name:'geomacro-d1-repair-only',compatibility_date:original.compatibility_date,
   d1_databases:[{...original.d1_databases[0],migrations_dir:dir}]}),{mode:0o600});
  const one=pendingRepairPlans(wrangler(single,['d1','migrations','list','DB','--remote']));
  if(one.length!==1||one[0]!==migration)throw Error('REPAIR_HISTORY_CHANGED');
  // Account for probes/bookmark/history latency before final mutation.
  admitRepairCost(migration,await budget());
  wrangler(single,['d1','migrations','apply','DB','--remote']);
  if(pendingRepairPlans(wrangler(single,['d1','migrations','list','DB','--remote'])).length)
   throw Error('REPAIR_HISTORY_READBACK_FAILED');
  const expectedObjects=REPAIR_SCHEMA_OBJECTS[migration.file.slice(0,4)];
  verifyRepairSchema(migration,JSON.parse(wrangler(configPath,
   ['d1','execute','DB','--remote','--json','--command',
    "SELECT name FROM sqlite_schema WHERE name IN ("+expectedObjects.map(n=>"'"+n+"'").join(',')+")"])));
  completed.push(migration.file);
  record(migration.file.slice(0,4),{schema:'geomacro.bounded-d1-repair-step.v1',file:migration.file,
   sql_sha256:migration.sha256,history_verified:true,schema_objects_verified:expectedObjects.length,estimated_cost_envelope:cost,
   provider_hard_cap_guaranteed:false,worker_uploaded:false,traffic_promoted:false,payments:0});
  // If old traffic consumed the budget while DDL ran, stop before another step.
  await budget();
 }
 if(pending().length)throw Error('REPAIR_PENDING_AFTER_EXECUTION');
 const result={schema:'geomacro.bounded-d1-repair.v1',completed,
  pending_reviewed_migrations:0,worker_uploaded:false,traffic_promoted:false,payments:0,
  schema_semantic_readback_required:true,physical_row_savings_proven:false};
 record('result',result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 runProtectedD1Repair().then(x=>console.log(JSON.stringify(x))).catch(e=>{
  // Child-process errors may contain provider details. Emit allowlisted codes only.
  console.error(JSON.stringify({status:'HOLD',code:/^REPAIR_[A-Z0-9_]+$/.test(e?.message??'')?e.message:'REPAIR_EXECUTION_UNAVAILABLE',payments:0}));process.exitCode=2;
 });
}
