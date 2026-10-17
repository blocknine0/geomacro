import {afterEach,test} from "node:test";
import assert from "node:assert/strict";
import {fetchComtrade,fetchComtradeTradeFlows} from "../../global-intelligence/adapters/un-comtrade.mjs";

const originalFetch=globalThis.fetch;
const originalKey=process.env.UN_COMTRADE_API_KEY;
afterEach(()=>{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.UN_COMTRADE_API_KEY;
  else process.env.UN_COMTRADE_API_KEY=originalKey;
});
const fixture=(x,status=200)=>new Response(JSON.stringify(x),{
  status,headers:{"content-type":"application/json"}
});
function record(flowCode,overrides={}){
  return {reporterCode:842,period:2024,cmdCode:"260500",flowCode,
    partnerCode:0,primaryValue:flowCode==="X"?100:80,netWgt:4,...overrides};
}
function stub({withoutImport=false,failStatus=0}={}){
  const calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    if(failStatus)return fixture({error:"internal"},failStatus);
    const flow=new URL(url).searchParams.get("flowCode");
    return fixture({data:withoutImport&&flow==="M"?[]:[record(flow)]});
  };
  return calls;
}
test("authenticated key stays upstream and never appears in observations or errors",async()=>{
  process.env.UN_COMTRADE_API_KEY="unit-test-secret-not-real";
  const calls=stub();
  const rows=await fetchComtrade("USA",{
    reporterCode:842,period:"2024",cmdCode:"260500",flowCode:"X",
    category:"CRITICAL_MINERALS"
  });
  assert.equal(rows.length,1);
  assert.match(calls[0],/subscription-key=unit-test-secret-not-real/);
  assert.doesNotMatch(JSON.stringify(rows),/unit-test-secret-not-real|subscription-key/);
  assert.equal(rows[0].published_at,null);
  assert.equal(rows[0].raw.period_is_publication_date,false);
  assert.equal(rows[0].raw.commercial_rights_verified,false);
  assert.equal(rows[0].raw.hs_vintage_verified,false);
  assert.notEqual(rows[0].observed_at,"2024-12-31T00:00:00Z");
  stub({failStatus:429});
  await assert.rejects(()=>fetchComtrade("USA",{
    reporterCode:842,period:"2024",cmdCode:"260500",category:"CRITICAL_MINERALS"
  }),e=>!String(e.message).includes("unit-test-secret-not-real"));
});
test("partial or absent trade flow never fabricates balance zero",async()=>{
  delete process.env.UN_COMTRADE_API_KEY;
  stub({withoutImport:true});
  const x=await fetchComtradeTradeFlows("USA",{
    reporterCode:842,period:"2024",cmdCode:"260500",category:"CRITICAL_MINERALS"
  });
  assert.equal(x.trade_balance_complete,false);
  assert.equal(x.trade_balance,null);
  assert.equal(x.observations.length,1);
});
test("exact single-row flows form an explicitly unlicensed historical balance",async()=>{
  delete process.env.UN_COMTRADE_API_KEY;
  stub();
  const x=await fetchComtradeTradeFlows("USA",{
    reporterCode:842,period:"2024",cmdCode:"260500",category:"CRITICAL_MINERALS"
  });
  assert.equal(x.trade_balance_complete,true);
  assert.equal(x.trade_balance.raw.balance,20);
  assert.equal(x.trade_balance.published_at,null);
  assert.equal(x.trade_balance.raw.commercial_rights_verified,false);
});
test("mixed reporter/period/HS/flow/partner rows fail closed",async()=>{
  for(const changed of [
    {reporterCode:156},{period:2023},{cmdCode:"TOTAL"},
    {flowCode:"M"},{partnerCode:156}
  ]){
    globalThis.fetch=async()=>fixture({data:[record("X",changed)]});
    await assert.rejects(()=>fetchComtrade("USA",{
      reporterCode:842,period:"2024",cmdCode:"260500",
      flowCode:"X",category:"CRITICAL_MINERALS"
    }),/UN_COMTRADE_ROW_SCOPE_UNVERIFIED/);
  }
});
test("shared HS headings and TOTAL cannot imply mineral-specific trade",async()=>{
  globalThis.fetch=async()=>{throw Error("Should not access network");};
  for(const cmdCode of ["TOTAL","253090","2605,2603","0101"]){
    await assert.rejects(()=>fetchComtrade("USA",{
      reporterCode:842,period:"2024",cmdCode,category:"CRITICAL_MINERALS"
    }),/UN_COMTRADE_MINERAL_SCOPE_UNVERIFIED/);
  }
  await assert.rejects(()=>fetchComtrade("USA",{
    reporterCode:842,period:["2023","2024"],cmdCode:"260500",category:"CRITICAL_MINERALS"
  }),/UN_COMTRADE_SINGLE_PERIOD_REQUIRED/);
  await assert.rejects(()=>fetchComtrade("USA",{
    reporterCode:842,period:"2024",cmdCode:"260500",maxRecords:10000,category:"CRITICAL_MINERALS"
  }),/UN_COMTRADE_RECORDS_LIMIT_INVALID/);
});
