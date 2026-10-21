import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
describe('offline PR contracts cannot impersonate live production evidence',()=>{
 it('runs both GRI audits without a live backend and labels the pinned fixture',()=>{
  const dir=mkdtempSync(join(tmpdir(),'geomacro-pr-contract-'));
  try{for(const script of ['audit-gri-validation-evidence','audit-gri-v12-sensitivity']){
   const output=join(dir,script+'.json');
   const env={...process.env,APP_SUPABASE_URL:'',SUPABASE_URL:'',APP_SUPABASE_ANON_KEY:'',
    GITHUB_EVENT_NAME:'pull_request',GRI_PR_OFFLINE_CONTRACT:'1',GRI_REQUIRE_PUBLIC_FRESHNESS:'false',
    GRI_VALIDATION_EVIDENCE_ARTIFACT:output,GRI_SENSITIVITY_ARTIFACT:output};
   const run=spawnSync(process.execPath,['scripts/'+script+'.mjs'],{env,encoding:'utf8'});
   expect(run.status,run.stderr).toBe(0);const report=JSON.parse(readFileSync(output,'utf8'));
   expect(report.dataSource).toBe('pinned_pr_fixture');expect(report.fixtureVersion).toBeTruthy();
   const forbidden=spawnSync(process.execPath,['scripts/'+script+'.mjs'],{env:{...env,GITHUB_EVENT_NAME:'workflow_dispatch'},encoding:'utf8'});
   expect(forbidden.status).not.toBe(0);expect(forbidden.stderr).toContain('restricted to pull_request');
  }}finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('renders shadow Growth from a labeled PR fixture and refuses fixture use for live or manual runs',()=>{
  const dir=mkdtempSync(join(tmpdir(),'geomacro-growth-contract-'));
  try{
   const args=['scripts/marketing/run-growth-agent.mjs','--pr-fixture','--out='+join(dir,'result.json')];
   const run=spawnSync(process.execPath,args,{env:{...process.env,GITHUB_EVENT_NAME:'pull_request'},encoding:'utf8'});
   expect(run.status,run.stderr).toBe(0);const report=JSON.parse(run.stdout);
   expect(report.evidence_source).toBe('SYNTHETIC_PR_FIXTURE');expect(report.production_readiness_verified).toBe(false);
   expect(report.social_distribution.live_publish_attempted).toBe(false);
   for(const [event,extra] of [['workflow_dispatch',[]],['pull_request',['--live']]] as const){
    const bad=spawnSync(process.execPath,[...args,...extra],{env:{...process.env,GITHUB_EVENT_NAME:event},encoding:'utf8'});
    expect(bad.status).not.toBe(0);expect(bad.stderr).toContain('restricted to non-live pull-request');
   }
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
