import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
import {readAccountBudget,validateAccountBudget} from "../../scripts/ops/read-account-free-tier-footprint.mjs";

const now=new Date("2026-10-15T13:00:00.000Z");
function sample(get=0,put=0,head=0,auth=0){
  return {ok:true,schema:"geomacro.b2-account-quota-status.v1",
    day_utc:"2026-10-15",
    used:{total:get+put+head+auth,GET:get,PUT:put,HEAD:head,NATIVE_AUTH:auth},
    limits:B2_DAILY_LIMITS,
    account_wide_reporting_requires_all_clients_governed:true};
}
describe("Supabase-free recurring quota footprint",()=>{
  it("reads ONLY the canonical D1 quota status and never reserves a B2 ticket",async()=>{
    const calls:string[]=[];
    const proof=await readAccountBudget({now,governor:{
      status:async()=>{calls.push("status");return sample(3,5);}
    }});
    expect(calls).toEqual(["status"]);
    expect(proof).toMatchObject({
      ok:true,source:"canonical-cloudflare-d1-b2-account-quota",
      b2_remaining:{total:72,GET:22,PUT:50},
      status_read_only:true,per_b2_operation_atomic_reservation_still_required:true,
      supabase_required:false,supabase_network_calls:0,b2_network_calls:0,
      d1_writes:0,payments:0,other_platform_usage_unknown:true,
      d1_daily_operations_used:null,workers_daily_requests_used:null,
      durable_object_usage:null,
    });
  });
  it("reports depleted capacity without pretending it resets or grants writes",()=>{
    const v=validateAccountBudget(sample(25,55),{now});
    expect(v.b2_daily_quota_exhausted).toBe(true);
    expect(v.b2_remaining.total).toBe(0);
    expect(v.ungoverned_b2_admission).toBe(false);
  });
  it("rejects stale, untrusted, mismatched, and unauthorized quota receipts",()=>{
    const bad=[
      {...sample(),ok:false},
      {...sample(),day_utc:"2026-10-14"},
      {...sample(),account_wide_reporting_requires_all_clients_governed:false},
      {...sample(),schema:"fabricated"},
      {...sample(),limits:{...B2_DAILY_LIMITS,GET:999}},
      {...sample(),used:{total:1,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0}},
      {...sample(),used:{total:1,GET:-1,PUT:2,HEAD:0,NATIVE_AUTH:0}},
    ];
    for(const status of bad)expect(()=>validateAccountBudget(status,{now}))
      .toThrow(/^ACCOUNT_FOOTPRINT_/);
    expect(()=>validateAccountBudget(sample(),{now:new Date("invalid")}))
      .toThrow("ACCOUNT_FOOTPRINT_D1_STATUS_UNVERIFIED");
  });
  it("fails closed when D1 is unreachable; never falls back to Supabase",async()=>{
    await expect(readAccountBudget({now,governor:{status:async()=>{
      throw Error("D1_NETWORK_DENIED");
    }}})).rejects.toThrow("D1_NETWORK_DENIED");
  });
  it("workflow cannot inject Supabase, grant recurring legacy ingest or mask deep-health 503",()=>{
    const wf=readFileSync(".github/workflows/free-tier-recurring-footprint.yml","utf8");
    expect(wf).toContain("read-account-free-tier-footprint.mjs");
    expect(wf).toContain("CLOUDFLARE_API_TOKEN:");
    expect(wf).toContain("D1_DATABASE_ID=");
    expect(wf).not.toContain("SUPABASE_DB_URL:");
    expect(wf).not.toContain("supabase-free-tier-budget.mjs |");
    expect(wf).not.toContain("recurring_ingest_allowed:true");
    expect(wf).toContain("PUBLIC_DEEP_HEALTH_NOT_READY");
    expect(wf).toContain("if: always()");
  });
});
