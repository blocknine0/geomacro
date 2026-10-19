import {describe,it,expect} from "vitest";
import {deriveTreasuryQuarterlyFx,loadQualifiedTreasuryFx,loadQualifiedTreasuryFxCountryContext} from "./qualified-treasury-fx.server";
const now=new Date("2026-10-19T04:00:00Z");
const row=(date:string,rate:string)=>({country:"India",currency:"Rupee",country_currency_desc:"India-Rupee",record_date:date,effective_date:date,exchange_rate:rate});
const data=()=>({data:[row("2026-09-30","95.83"),row("2026-06-30","94.66")]});
describe("quarterly India reporting FX",()=>{
 it("derives fixed-point change and preserves native quarter clocks",()=>{
  expect(deriveTreasuryQuarterlyFx(data(),now)).toEqual({changePct:1.236003,observedAt:"2026-09-30T23:59:59.000Z",previousAt:"2026-06-30T23:59:59.000Z"});
 });
 it("rejects foreign rows, duplicates, nonconsecutive quarters and amended effective dates",()=>{
  const edits=[(d:any)=>d.data[0].country="Pakistan",(d:any)=>d.data[0].currency="Dollar",
   (d:any)=>d.data[0].exchange_rate="0",(d:any)=>d.data[0].exchange_rate="Infinity",
   (d:any)=>d.data[0].exchange_rate="1e2",(d:any)=>d.data[1]=d.data[0],
   (d:any)=>d.data[1]=row("2026-03-31","94"),(d:any)=>d.data[0].effective_date="2026-10-01",
   (d:any)=>d.data.push(d.data[0]),(d:any)=>d.data[0].record_date="2026-09-31"];
  for(const edit of edits){const d=data();edit(d);expect(()=>deriveTreasuryQuarterlyFx(d,now)).toThrow()}
 });
 it("rejects future and stale reference clocks without refreshing from retrieval",()=>{
  expect(()=>deriveTreasuryQuarterlyFx(data(),new Date("2026-09-30T10:00:00Z"))).toThrow();
  expect(()=>deriveTreasuryQuarterlyFx(data(),new Date("2027-03-01T00:00:00Z"))).toThrow();
 });
 it("rounds signed fixed-point percentage ties to even",()=>{
  const d=data();d.data[0].exchange_rate="0.999999";d.data[1].exchange_rate="1";
  expect(deriveTreasuryQuarterlyFx(d,now).changePct).toBe(-0.0001);
 });
 it("changed, empty, redirected or oversized terms fail before a data read",async()=>{
  for(const response of [new Response("changed"),new Response("",{status:200}),new Response("redirect",{status:302}),new Response("x".repeat(100001))]){
   let calls=0;const fetchImpl=(async()=>{calls++;return response}) as typeof fetch;
   expect(await loadQualifiedTreasuryFx({now,fetchImpl})).toBeNull();expect(calls).toBe(1);
  }
 });
 it("unapproved country fails without network",async()=>{
  const fetchImpl=(async()=>{throw Error("must not fetch")}) as typeof fetch;
  expect(await loadQualifiedTreasuryFxCountryContext("USA",{now,fetchImpl})).toBeNull();
 });
});
