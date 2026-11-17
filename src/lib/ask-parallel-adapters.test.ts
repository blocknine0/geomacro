import {afterEach,describe,expect,it,vi} from "vitest";
import {answerQuestion} from "../../global-intelligence/engine/intelligence-engine.mjs";
afterEach(()=>vi.useRealTimers());
describe("bounded parallel hybrid live adapters",()=>{
 it("launches all three categories without serializing, but keeps ordered diagnostics",async()=>{
  const called:string[]=[];
  let release!:()=>void;
  const pending=new Promise<void>(r=>{release=r;});
  const first=async()=>{called.push("geo");await pending;return [];};
  const second=async()=>{called.push("macro");return {observations:[],requested_indicators:["FP.CPI.TOTL.ZG"]};};
  const third=async()=>{called.push("minerals");throw Error("SYNTHETIC_SOURCE_DOWN");};
  const resultPromise=answerQuestion("conflict inflation lithium",{
    adapters:{GEOPOLITICS:first,MACRO:second,CRITICAL_MINERALS:third},
    options:{forceLive:true,bypassCache:true,cacheTtlMs:0},
  });
  await Promise.resolve();
  expect(called).toHaveLength(3);
  expect(new Set(called)).toEqual(new Set(["geo","macro","minerals"]));
  release();
  const output=await resultPromise;
  expect(output.adapter_results.GEOPOLITICS.unavailable).toBe(false);
  expect(output.adapter_results.MACRO.requested).toEqual(["FP.CPI.TOTL.ZG"]);
  expect(output.adapter_results.CRITICAL_MINERALS.unavailable).toBe(true);
  expect(output.insufficient_evidence).toBe(true);
  expect(output.durable_live_storage_write).toBe(false);
  expect(output.source_identity_exposed).toBe(false);
 });

 it("times out only the slow adapter and still returns the completed category results",async()=>{
  vi.useFakeTimers();
  const pending=answerQuestion("conflict inflation lithium bounded timeout",{
    adapters:{
      GEOPOLITICS:()=>new Promise(()=>{}),
      MACRO:async()=>[],
      CRITICAL_MINERALS:async()=>[],
    },
    options:{forceLive:true,bypassCache:true,cacheTtlMs:0,adapterTimeoutMs:4_000},
  });
  await vi.advanceTimersByTimeAsync(4_000);
  const output=await pending;
  expect(output.adapter_results.GEOPOLITICS.unavailable).toBe(true);
  expect(output.adapter_results.MACRO.unavailable).toBe(false);
  expect(output.adapter_results.CRITICAL_MINERALS.unavailable).toBe(false);
  expect(output.insufficient_evidence).toBe(true);
 });
});
