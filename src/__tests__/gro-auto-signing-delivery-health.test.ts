import { describe,it,expect } from "vitest";
import { readGroAutoSigningHealth } from "../../workers/control-plane/src/gro-auto-signing-health.mjs";

const at=Date.parse("2026-11-08T00:00:00.000Z");
const freshCycle={
 run_id:"42424819233:1",source_sha:"a".repeat(40),
 finished_at:new Date(at-60_000).toISOString(),signer_key_id:"approved-key",
 signer_pair_verified:1,claimed:0,signed:0,failed:0,state:"DONE",
};
function fakeEnv(cycle:unknown=freshCycle,signed:unknown=null){
 const calls:string[]=[];
 const DB={prepare(query:string){
  calls.push(query);
  if(query.includes("gro_auto_signing_cycles"))return {first:async()=>cycle};
  if(query.includes("SELECT state,COUNT(*)"))return {bind:(_stamp:string)=>({all:async()=>({results:[]})})};
  if(query.includes("signed_gro_expires_at"))return {bind:(proofAt:string,groAt:string)=>({
   first:async()=>{expect(proofAt).toBe(new Date(at).toISOString());expect(groAt).toBe(proofAt);return signed;},
  })};
  throw Error("UNKNOWN_SQL");
 }};
 return {DB,calls};
}
describe("qualified signed-delivery production health (no funds)",()=>{
 it("never promotes signer operational status to a fictitious current signed product",async()=>{
  const env=fakeEnv();
  const result=await readGroAutoSigningHealth(env,at);
  expect(result.ok).toBe(true);
  expect(result.automation_active).toBe(true);
  expect(result.signer_pair_verified).toBe(true);
  expect(result.unexpired_qualified_signed_record_available).toBe(false);
  expect(result.qualification_pipeline_state).toBe("NO_CURRENT_QUALIFIED_SIGNED_JOB");
  expect(result.current_live_worker_readback_rechecked).toBe(false);
  expect(result.paid_customer_delivery_verified).toBe(false);
  expect(result.last_cycle).toMatchObject({claimed:0,signed:0});
  expect(env.calls.find(x=>x.includes("WHERE state='SIGNED'")))
   .toContain("expires_at>? AND signed_gro_expires_at>?");
 });
 it("reports only previously independently verified unexpired signed job, not new payment authority",async()=>{
  const env=fakeEnv(freshCycle,{signed_record_sha256:"c".repeat(64)});
  const result=await readGroAutoSigningHealth(env,at);
  expect(result.unexpired_qualified_signed_record_available).toBe(true);
  expect(result.qualification_pipeline_state).toBe("SIGNED_HOT_PREVIOUS_READBACK_UNEXPIRED");
  expect(result.current_live_worker_readback_rechecked).toBe(false);
  expect(result.paid_customer_delivery_verified).toBe(false);
  expect(result.payment_performed).toBe(false);
 });
 it("fails closed on unknown D1 state instead of assuming LIVE",async()=>{
  const result=await readGroAutoSigningHealth({DB:{prepare(){throw Error("DB_QUOTA")}}},at);
  expect(result.ok).toBe(false);
  expect(result.automation_active).toBe(false);
  expect(result.error).toBe("GRO_AUTO_SIGNING_HEALTH_UNAVAILABLE");
 });
});
