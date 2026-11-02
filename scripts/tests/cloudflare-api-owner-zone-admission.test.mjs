import test from "node:test";
import assert from "node:assert/strict";
import {
 classifyCustomDomainZone,prepareCustomDomainConfig,probeDomainZone,
 prepareCustomDomainRuntime,
} from "../ops/prepare-cloudflare-custom-domain-runtime.mjs";

const account="a".repeat(32),zone="b".repeat(32);
const config={name:"geomacro-control-plane",workers_dev:true,
  routes:[{pattern:"api.geomacro.live",custom_domain:true,zone_name:"geomacro.live"}],
  triggers:{crons:["* * * * *"]}};
const body={success:true,result:[{
 name:"geomacro.live",id:zone,status:"active",account:{id:account},
}]};
test("exact owner active zone admits a managed native domain, not a CNAME route",()=>{
 assert.equal(classifyCustomDomainZone({status:200,payload:body,accountId:account}),zone);
 const result=prepareCustomDomainConfig(config,zone);
 assert.deepEqual(result.routes,[{pattern:"api.geomacro.live",custom_domain:true,zone_id:zone}]);
 assert.deepEqual(result.triggers.crons,["* * * * *"]);
});
test("different-account, pending, multiple and unavailable zones never attach",()=>{
 for(const value of [
  {...body,result:[{...body.result[0],account:{id:"c".repeat(32)}}]},
  {...body,result:[{...body.result[0],status:"pending"}]},
  {...body,result:[body.result[0],body.result[0]]},
  {success:false,result:body.result},
 ]){
  assert.equal(classifyCustomDomainZone({status:200,payload:value,accountId:account}),null);
 }
 assert.equal(classifyCustomDomainZone({status:403,payload:body,accountId:account}),null);
 assert.equal(prepareCustomDomainConfig(config,null).routes,undefined);
});
test("no owner zone keeps core 1-minute deployment config, and exposes missing domain",async()=>{
 let updated="";
 const result=await prepareCustomDomainRuntime({
  path:"unused",apiToken:"test",accountId:account,
  read:async()=>JSON.stringify(config),
  write:async(_path,bytes)=>{updated=bytes},
  fetcher:async()=>Response.json({success:true,result:[]}),
 });
 assert.equal(result.admitted,false);
 const value=JSON.parse(updated);
 assert.equal(value.routes,undefined);
 assert.deepEqual(value.triggers.crons,["* * * * *"]);
});
test("active same-account zone auto-reenters without manual code edit",async()=>{
 let updated="";
 const result=await prepareCustomDomainRuntime({
  path:"unused",apiToken:"test",accountId:account,
  read:async()=>JSON.stringify(config),
  write:async(_path,bytes)=>{updated=bytes},
  fetcher:async()=>Response.json(body),
 });
 assert.equal(result.admitted,true);
 assert.equal(JSON.parse(updated).routes[0].zone_id,zone);
});
