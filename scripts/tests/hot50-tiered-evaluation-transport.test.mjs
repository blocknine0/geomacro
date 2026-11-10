import test from "node:test";
import assert from "node:assert/strict";
import {HOT50_TIERED_ENDPOINT,probeHot50TieredProduct} from
 "../lib/hot50-tiered-evaluation-transport.mjs";
const token="a".repeat(64);
test("probes the deployed control-plane Worker, not unverified custom-domain DNS",async()=>{
 let called=false;
 const result=await probeHot50TieredProduct({country:"IND",tier:"standard",token,
  fetchImpl:async(url,options)=>{
   called=true;
   assert.equal(url,HOT50_TIERED_ENDPOINT);
   assert.match(url,/geomacro-control-plane\.daspallab202391\.workers\.dev/u);
   assert.equal(options.method,"POST");
   assert.equal(options.redirect,"manual");
   assert.equal(options.headers.Authorization,"Bearer "+token);
   assert.deepEqual(JSON.parse(options.body),{
    target_type:"COUNTRY",target_id:"IND",product_tier:"standard",
    client_policy:"STRICT"});
   assert.equal(options.headers.Accept,"application/json");
   assert(!Object.hasOwn(options.headers,"PAYMENT-SIGNATURE"));
   return new Response(JSON.stringify({ok:false,error:"RISK_GATE_PROOF_NOT_READY"}),
    {status:503,headers:{"content-type":"application/json"}});
 }});
 assert.equal(called,true);
 assert.equal(result.transport_state,"JSON_RESPONSE");
 assert.equal(result.http_status,503);
 assert.equal(result.contract_body.error,"RISK_GATE_PROOF_NOT_READY");
});
test("distinguishes denied JSON from non-JSON and redirects without making up missing sources",async()=>{
 const responses=[
  [new Response('{"ok":false,"error":"DENIED"}',{status:401,headers:{"content-type":"application/json"}}),
    "JSON_RESPONSE",401],
  [new Response("<html>proxy</html>",{status:200,headers:{"content-type":"text/html"}}),
    "NON_JSON_RESPONSE",200],
  [new Response(null,{status:302,headers:{Location:"https://redirect.example"}}),
    "REDIRECT_REJECTED",302],
  [new Response("bad",{status:200,headers:{"content-type":"application/json"}}),
    "INVALID_JSON",200],
 ];
 for(const [resp,state,status] of responses){
  const r=await probeHot50TieredProduct({country:"USA",tier:"standard",token,
   fetchImpl:async()=>resp});
  assert.equal(r.transport_state,state);
  assert.equal(r.http_status,status);
  assert.equal(r.contract_body===null,state!=="JSON_RESPONSE");
 }
 const network=await probeHot50TieredProduct({country:"USA",tier:"standard",token,
  fetchImpl:async()=>{throw Error("bad network, secret should never be reported");}});
 assert.deepEqual(network,{http_status:null,transport_state:"NETWORK_OR_TIMEOUT",contract_body:null});
 assert.equal(JSON.stringify(network).includes("secret"),false);
});
test("rejects unsupported tier, country and credential before network activity",async()=>{
 for(const bad of [{country:"IND",tier:"fake",token},
  {country:"AFGH",tier:"standard",token},{country:"USA",tier:"standard",token:"bad"}]){
  await assert.rejects(probeHot50TieredProduct({...bad,fetchImpl:async()=>{throw Error("NETWORK_CALLED")}}),
   /HOT50_TIER_PROBE_INPUT_INVALID/);
 }
});
