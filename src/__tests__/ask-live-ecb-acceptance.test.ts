import {describe,expect,it} from "vitest";
import {parseVerifiedEcbReferenceCsv,probeEcbAsk}
 from "../../scripts/ops/verify-live-ask-ecb-sse.mjs";
const now=new Date("2026-10-17T10:00:00.000Z");
const source=(day="2026-10-16",value="1.164723")=>
 "KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n"+
 "EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,"+day+","+value+"\n";
const answer=(value="1.164723",day="2026-10-16")=>({
 summary:"ECB's latest available daily reference gives 1 EUR = "+value+" USD on "+day+".",
 what_changed:"Official euro foreign exchange reference rate.",
 why_it_matters:"Reference fixes are not live executable FX prices.",
 geomacro_view:"Source: ECB statistics. Original reference observation. Retrieved "+now.toISOString()+".",
 evidence:[{eventId:"live:official:numeric",title:"Official period "+day,relevance:100}],
 insufficient_evidence:false,source_identity_exposed:false,durable_live_storage_write:false,
 signed_gro_generated:false,independent_same_event_verification:false,gri:null,data_mode:"ephemeral_live",
});
const sse=(payload=answer())=>"event: stage\ndata: {\"stage\":\"researching\"}\n\n"+
 "event: stage\ndata: {\"stage\":\"finalizing\"}\n\n"+
 "event: answer\ndata: "+JSON.stringify({ok:true,data:payload})+"\n\n";
function provider({value="1.164723",day="2026-10-16",sseBody=sse(),code=200}:{
 value?:string;day?:string;sseBody?:string;code?:number;
}={}):typeof fetch{
 return (async (url:string,init?:RequestInit)=>{
  expect(init?.redirect).toBe("manual");
  if(url.includes("/api/ask/v2/turn")){
   expect(String(init?.body)).toContain("EUR/USD exchange rate");
   expect(String(init?.body)).not.toContain("payment");
   return new Response(sseBody,{status:code,
    headers:{"content-type":"text/event-stream"}});
  }
  expect(url).toContain("data-api.ecb.europa.eu");
  return new Response(source(day,value),{status:200});
 }) as typeof fetch;
}
describe("real-public ECB day-aligned no-funds Ask acceptance",()=>{
 it("crosschecks identical original daily ECB observation and product SSE",async()=>{
  const res=await probeEcbAsk(provider(),now);
  expect(res.ok).toBe(true);
  expect(res.independent_ecb_day_rate_matched).toBe(true);
  expect(res.progress_events).toBe(2);
  expect(JSON.stringify(res)).not.toContain("1.164723");
 });
 it("rejects wrong rate, stale date, and raw source exposure",async()=>{
  await expect(probeEcbAsk(provider({value:"1.564723"}),now))
   .rejects.toThrow("ASK_ECB_SOURCE_RATE_MISMATCH");
  await expect(probeEcbAsk(provider({day:"2026-10-14"}),now))
   .rejects.toThrow("ASK_ECB_SOURCE_DATE_MISMATCH");
  await expect(probeEcbAsk(provider({sseBody:sse({...answer(),summary:
   "ECB's latest available daily reference gives 1 EUR = 1.164723 USD on 2026-10-16. https://private.test"})}),now))
   .rejects.toThrow("ASK_ECB_RAW_UPSTREAM_LEAK");
  await expect(probeEcbAsk(provider({sseBody:sse({...answer(),signed_gro_generated:true})}),now))
   .rejects.toThrow("ASK_ECB_OFFICIAL_REFERENCE_NOT_VERIFIED");
 });
 it("supports SDMX KEY-first official CSV; rejects future, spoofed and empty source",()=>{
  expect(parseVerifiedEcbReferenceCsv(source(),now)).toEqual({day:"2026-10-16",value:1.164723});
  expect(()=>parseVerifiedEcbReferenceCsv(source("2026-11-11"),now))
   .toThrow("ASK_ECB_REFERENCE_NO_VALID_OBSERVATION");
  expect(()=>parseVerifiedEcbReferenceCsv(source().replace(",USD,EUR,",",CNY,EUR,"),now))
   .toThrow("ASK_ECB_REFERENCE_NO_VALID_OBSERVATION");
 });
});
