import test from 'node:test';import assert from 'node:assert/strict';
import {readProductionD1Info} from '../ops/read-protected-d1-info.mjs';
import {checkTimeTravel} from '../ops/verify-protected-d1-migration-gate.mjs';
const env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'secret'.repeat(8)};
const databaseId='db057ca9-9f6e-4957-ac28-144f3b798f9b';
const metadata={uuid:databaseId,name:'geomacro-control-plane',version:'production'};
test('native provider production metadata satisfies backup proof without trusting stripped CLI JSON',async()=>{
 const result=await readProductionD1Info({env,databaseId,fetchImpl:async(url,init)=>{
  assert.ok(url.endsWith('/d1/database/'+databaseId));assert.equal(init.redirect,'error');
  assert.equal(init.cache,'no-store');return Response.json({success:true,result:metadata});
 }});
 const bookmark=JSON.stringify({bookmark:'00000001-00000002-00000003-abcdefabcdef123456789abc'});
 assert.equal(checkTimeTravel(JSON.stringify(result),bookmark).restore_exercised,false);
 const {version,...cliOutput}=metadata;
 assert.throws(()=>checkTimeTravel(JSON.stringify(cliOutput),bookmark),/TIME_TRAVEL/);
});
test('alpha, missing version, wrong database/account, denial and fake success cannot authorize migration',async()=>{
 for(const result of [{...metadata,version:'alpha'},{...metadata,version:undefined},
  {...metadata,uuid:'other'},{...metadata,name:'other'}])
  await assert.rejects(readProductionD1Info({env,databaseId,fetchImpl:async()=>Response.json({success:true,result})}),/PRODUCTION_INFO/);
 await assert.rejects(readProductionD1Info({env,databaseId,fetchImpl:async()=>Response.json({success:false,result:metadata},{status:403})}),/PRODUCTION_INFO/);
 await assert.rejects(readProductionD1Info({env:{},databaseId}),/IDENTITY/);
});
