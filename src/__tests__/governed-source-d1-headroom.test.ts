import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createB2D1AccountGovernor } from "../../scripts/ops/b2-d1-account-governor.mjs";
import { evaluateGovernedB2Headroom } from "../../scripts/lib/governed-b2-headroom.mjs";
import { checkGovernedB2Headroom } from "../../scripts/ops/check-governed-source-b2-headroom.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const clock=new Date("2026-10-10T03:00:00.000Z");
const empty=()=>({
  ok:true,schema:"geomacro.b2-account-quota-status.v1",
  day_utc:"2026-10-10",
  used:{total:0,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0},
  limits:B2_DAILY_LIMITS,
  account_wide_reporting_requires_all_clients_governed:true,
});
const from=({GET=0,PUT=0,HEAD=0,NATIVE_AUTH=0}={})=>{
  const status=empty();
  status.used={total:GET+PUT+HEAD+NATIVE_AUTH,GET,PUT,HEAD,NATIVE_AUTH};
  return status;
};
const env={
  CLOUDFLARE_ACCOUNT_ID:"1234567890abcdef1234567890abcdef",
  CLOUDFLARE_API_TOKEN:"x".repeat(64),
  D1_DATABASE_ID:"abcdef1234567890abcdef1234567890",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID:"governed_source_ingestion",
};

describe("#1827 read-only B2 daily account quota gate for governed EIA/NOAA",()=>{
  it("admits capacity for two independent read-back-verified source archives",()=>{
    const decision=evaluateGovernedB2Headroom(from({GET:23,PUT:53}),{
      getRequests:2,putRequests:2,now:clock,
    });
    expect(decision).toMatchObject({
      admitted:true,reason:"HEADROOM_AVAILABLE",
      day_utc:"2026-10-10",checked_before_b2_network:true,
      guarantee_against_concurrent_reservations:false,
      still_requires_atomic_per_request_d1_tickets:true,
      public_published:false,commercial_eligible:false,
      source_freshness_not_asserted:true,
      supabase_writes:0,b2_requests_by_this_check:0,usdc_spent:0,
    });
    expect(evaluateGovernedB2Headroom(empty(),{now:clock}).admitted).toBe(true);
  });

  it("holds exactly at shared GET/PUT/total limits without spending a B2 ticket",()=>{
    for(const [status,request] of [
      [from({GET:24,PUT:5}),{getRequests:2,putRequests:2}],
      [from({GET:4,PUT:54}),{getRequests:2,putRequests:2}],
      [from({GET:24,PUT:50,HEAD:5}),{getRequests:2,putRequests:2}],
      [from({GET:17,PUT:47}),{getRequests:9,putRequests:9}],
    ] as const) {
      const d=evaluateGovernedB2Headroom(status,{...request,now:clock});
      expect(d.admitted).toBe(false);
      expect(d.reason).toBe("SHARED_B2_DAILY_BUDGET_HELD");
      expect(d.b2_requests_by_this_check).toBe(0);
    }
  });

  it("fails closed for stale UTC day, missing receipts, invented limits and tampering",()=>{
    const invalid=[
      {...empty(),day_utc:"2026-10-09"},
      {...empty(),ok:false},
      {...empty(),schema:"fake"},
      {...empty(),limits:{...B2_DAILY_LIMITS,GET:999}},
      {...empty(),used:{total:3,GET:1,PUT:1,HEAD:0,NATIVE_AUTH:0}},
      {...empty(),used:{total:0,GET:-1,PUT:0,HEAD:0,NATIVE_AUTH:0}},
      {...empty(),account_wide_reporting_requires_all_clients_governed:false},
    ];
    for(const status of invalid)
      expect(()=>evaluateGovernedB2Headroom(status,{now:clock}))
        .toThrow(/^GOVERNED_B2_/);
    expect(()=>evaluateGovernedB2Headroom(empty(),{now:clock,getRequests:1,putRequests:2}))
      .toThrow("GOVERNED_B2_HEADROOM_REQUEST_PLAN_INVALID");
    expect(()=>evaluateGovernedB2Headroom(empty(),{now:clock,getRequests:11,putRequests:11}))
      .toThrow("GOVERNED_B2_HEADROOM_REQUEST_PLAN_INVALID");
  });

  it("Cloudflare read-only status uses D1 SELECT, never reserves B2 quota",async()=>{
    const sqls:string[]=[];
    const governor=createB2D1AccountGovernor({
      env,now:()=>clock,
      fetchImpl:vi.fn(async(_url:string,init:any)=>{
        const body=JSON.parse(init.body);
        sqls.push(body.sql);
        expect(body.params).toEqual(["2026-10-10"]);
        return Response.json({success:true,result:[{success:true,results:[{
          total_requests:10,get_requests:4,put_requests:6,
          head_requests:0,native_auth_requests:0,
        }]}]});
      }),
    });
    const status=await governor.status();
    expect(status.used.total).toBe(10);
    const proof=await checkGovernedB2Headroom({governor,now:clock});
    expect(proof.admitted).toBe(true);
    expect(sqls).toHaveLength(2);
    expect(sqls.every(s=>s.includes("SELECT")&&!s.includes("INSERT")&&
      !s.includes("ON CONFLICT"))).toBe(true);
  });

  it("Cloudflare D1 unavailable is an error, never a quiet quota reset or ungoverned B2 path",async()=>{
    const governor=createB2D1AccountGovernor({
      env,now:()=>clock,
      fetchImpl:async()=>new Response("access denied",{status:403}),
    });
    await expect(checkGovernedB2Headroom({governor,now:clock}))
      .rejects.toThrow(/^B2_ACCOUNT_/);
  });

  it("scheduled source import never auto-runs on unrelated Worker merges and refuses B2 when held",()=>{
    const workflow=readFileSync(".github/workflows/governed-source-ingestion.yml","utf8");
    const ingester=readFileSync("scripts/ingest-certified-sources.mjs","utf8");
    const runner=readFileSync("scripts/ops/check-governed-source-b2-headroom.mjs","utf8");
    const contract=readFileSync("scripts/test-governed-source-ingestion.mjs","utf8");
    expect(workflow).toContain('cron: "17 2 * * *"');
    expect(workflow).not.toContain('      - "workers/control-plane/**"');
    expect(workflow).not.toContain('      - "scripts/ops/b2-s3-client.mjs"');
    expect(workflow).toContain("Read shared B2 account headroom before downloading source data");
    expect(workflow).toContain("node scripts/ops/check-governed-source-b2-headroom.mjs");
    expect(workflow).toContain("Quota-held governed measurements");
    expect(workflow).toContain("id: headroom");
    const preflightIdx=workflow.indexOf("Read shared B2 account headroom");
    const downloadsIdx=workflow.indexOf("Run governed B2-first ingestion");
    expect(preflightIdx).toBeLessThan(downloadsIdx);
    for(const name of [
      "Run governed B2-first ingestion",
      "Write compact D1 ingestion checkpoints",
      "Verify D1 checkpoint readback",
      "Upload bounded ingestion evidence",
    ]) {
      expect(workflow).toContain(
        `- name: ${name}\n        if: steps.headroom.outputs.admitted == 'true'`);
    }
    expect(ingester.indexOf("const quotaSnapshot=await createB2D1AccountGovernor().status();"))
      .toBeLessThan(ingester.indexOf("const summaries = [];"));
    expect(ingester).toContain("plannedSourceFragmentCount");
    expect(ingester).toContain("GOVERNED_SOURCE_SHARED_B2_PLAN_QUOTA_HELD");
    expect(ingester).toContain("b2.putWithMetadataVerification");
    expect(ingester).toContain('B2_ACCOUNT_QUOTA_REQUIRED !== "1"');
    expect(runner).toContain("QUOTA-HELD");
    expect(contract).toContain("GOVERNED_B2_ACCOUNT_QUOTA_PREFLIGHT_ORDER_INVALID");
  });
});
