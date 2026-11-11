import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('../ops/ingest-derived-risk-gate-discovery.mjs',import.meta.url));
const lanes=['canonical','private_osint','reusable_news','gdelt_cameo','website_intelligence'];
function run(mode){
 const dir=mkdtempSync(join(tmpdir(),'gm-discovery-isolation-'));
 try{
  const receipt=join(dir,'receipt.json'),mock=join(dir,'mock.mjs');
  writeFileSync(mock,`
   const schema='geomacro.derived-risk-discovery-bridge.v1';
   // Fast virtual delays keep retry-exhaustion tests deterministic and bounded.
   const realTimer=globalThis.setTimeout;
   globalThis.setTimeout=(fn,_ms,...args)=>realTimer(fn,0,...args);
   let transientPrivateGet=0,transientWebsitePost=0;
   globalThis.fetch=async(raw,options)=>{
    const u=new URL(raw),lane=u.searchParams.get('lane');
    if(options.method==='POST'){
     const body=JSON.parse(options.body);
     if(body.operation)return Response.json({ok:true,schema,pruned_retention_hours:72,expired_rows_remaining:0,raw_archives_modified:false,commercialEligible:false});
     if(body.lane==='website_intelligence' &&
        process.env.TEST_MODE.startsWith('website_post_recover_')){
      const failures=Number(process.env.TEST_MODE.split('_').at(-1));
      if(transientWebsitePost++<failures)
       return Response.json({private_body:'SECRET_BODY'},{status:503});
      return Response.json({ok:true,schema,lane:'website_intelligence',
       admitted:1,d1_atomic_readback_verified:true,cursor_advanced:true,
       commercialEligible:false,paidDeliveryAuthorized:false});
     }
     if(process.env.TEST_MODE==='ack_failure')return Response.json({private_body:'SECRET_BODY'},{status:503});
    }
    if(lane==='canonical'&&process.env.TEST_MODE==='read_failure')
     return Response.json({private_body:'SECRET_BODY'},{status:503});
    if(lane==='private_osint'&&process.env.TEST_MODE.startsWith('private_get_recover_')){
     const failures=Number(process.env.TEST_MODE.split('_').at(-1));
     if(transientPrivateGet++<failures)
      return Response.json({private_body:'SECRET_BODY'},{status:503});
    }
    const records=(lane==='canonical'&&process.env.TEST_MODE==='ack_failure'||
      lane==='website_intelligence'&&process.env.TEST_MODE.startsWith('website_post_recover_'))?[{
     original_ref:'a'.repeat(64),source_sha:'b'.repeat(64),first_seen_at:'2026-11-05T10:00:00.000Z',
     observed_clock:'2026-11-05T09:00:00.000Z',category:'geopolitics',country_iso3:'USA'
    }]:[];
    return Response.json({ok:true,schema,lane,records,has_more:false,
     rights_verified:false,original_text_included:false,commercialEligible:false,paidDeliveryAuthorized:false,
     page_sha256:'c'.repeat(64),checked_at:new Date().toISOString(),
     next_cursor:records.length?{cursor_ref:lane==='website_intelligence'?
      'geopolitics-1234abcd':'a'.repeat(64),cursor_at:records[0].first_seen_at}:null});
   };
  `);
  const result=spawnSync(process.execPath,['--import',mock,runner],{encoding:'utf8',timeout:15000,
   env:{...process.env,TEST_MODE:mode,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'blocknine0/geomacro',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',
    GEOMACRO_COMMERCE_LEDGER_TOKEN:'test-only-root-secret-32-characters',
    GEOMACRO_DERIVED_DISCOVERY_SUMMARY_PATH:receipt}});
  assert.equal(result.error,undefined);
  const body=JSON.parse(readFileSync(receipt,'utf8'));
  assert.doesNotMatch(result.stdout+result.stderr+JSON.stringify(body),/SECRET_BODY|test-only-root-secret|Bearer /);
  return {result,body};
 }finally{rmSync(dir,{recursive:true,force:true})}
}
for(const mode of ['read_failure','ack_failure'])test(mode+' preserves failure evidence and lets all healthy lanes finish',()=>{
 const {result,body}=run(mode);
 assert.equal(result.status,1);
 assert.equal(body.ok,false);assert.equal(body.all_lanes_processed,false);
 assert.equal(body.retention_verified,false);
 assert.deepEqual(body.failed_lanes,['canonical']);
 assert.equal(body.per_lane.canonical.complete,false);
 assert.equal(body.per_lane.canonical.admitted,0);
 for(const lane of lanes.slice(1))assert.equal(body.per_lane[lane].complete,true,lane);
 assert.equal(body.signed_gro,false);assert.equal(body.commercial_activation,false);
});
for(const laneMode of ['private_get_recover_1','private_get_recover_2',
 'website_post_recover_1','website_post_recover_2']){
 test(laneMode+' retries transient 503 without falsifying D1 ACK',()=>{
  const {result,body}=run(laneMode);
  assert.equal(result.status,0,result.stderr);
  assert.equal(body.ok,true);
  assert.equal(body.all_lanes_processed,true);
  assert.deepEqual(body.failed_lanes,[]);
  if(laneMode.startsWith('website_post_'))
   assert.equal(body.per_lane.website_intelligence.admitted,1);
  else assert.equal(body.per_lane.private_osint.complete,true);
 });
}
test('all five healthy empty lanes verify retention without inventing evidence',()=>{
 const {result,body}=run('healthy');
 assert.equal(result.status,0);
 assert.equal(body.ok,true);assert.equal(body.all_lanes_processed,true);
 assert.equal(body.retention_verified,true);assert.deepEqual(body.failed_lanes,[]);
 for(const lane of lanes){assert.equal(body.per_lane[lane].complete,true);assert.equal(body.per_lane[lane].admitted,0)}
});
