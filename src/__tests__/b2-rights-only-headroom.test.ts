import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";
import { checkB2RightsOnlyHeadroom } from "../../scripts/ops/check-b2-rights-only-headroom.mjs";

const now = new Date("2026-10-11T13:50:00.000Z");
function ledger(used: {GET:number;PUT:number;HEAD:number;NATIVE_AUTH:number}) {
  return {
    ok: true,
    schema: "geomacro.b2-account-quota-status.v1",
    day_utc: "2026-10-11",
    used: { ...used, total: used.GET + used.PUT + used.HEAD + used.NATIVE_AUTH },
    limits: B2_DAILY_LIMITS,
    account_wide_reporting_requires_all_clients_governed: true,
  };
}
function governor(proof: unknown) {
  const status = vi.fn(async () => proof);
  const reserve = vi.fn(async () => { throw Error("MUST_NOT_RESERVE"); });
  return { status, reserve };
}
describe("single rights snapshot read-only D1 preflight", () => {
  it("admits bounded 2 GET + 2 PUT headroom, without reserving quota", async () => {
    const g = governor(ledger({ GET: 10, PUT: 25, HEAD: 3, NATIVE_AUTH: 2 }));
    const x = await checkB2RightsOnlyHeadroom({governor:g,now});
    expect(x).toMatchObject({
      schema:"geomacro.b2-rights-only-headroom.v1",
      day_utc:"2026-10-11",
      admitted:true,reason:"D1_SHARED_HEADROOM_OBSERVED",
      minimum_get_tickets:2,minimum_put_tickets:2,
      checked_before_source_database_read:true,
      d1_ledger_writes:0,b2_requests:0,supabase_requests:0,
      payment_executed:false,backblaze_provider_quota_verified:false,
      guaranteed_future_reservations:false,full_readback_verified:false,
      rights_refresh_complete:false,
    });
    expect(g.status).toHaveBeenCalledTimes(1);
    expect(g.reserve).not.toHaveBeenCalled();
  });
  it.each([
    ["total limit", { GET:22, PUT:50, HEAD:4, NATIVE_AUTH:3 }],
    ["GET limit", { GET:24, PUT:20, HEAD:2, NATIVE_AUTH:2 }],
    ["PUT limit", { GET:10, PUT:54, HEAD:2, NATIVE_AUTH:2 }],
  ] as const)("holds before B2 write when %s has no 2+2 headroom",async (_name, used) => {
    const g = governor(ledger(used));
    const x = await checkB2RightsOnlyHeadroom({governor:g,now});
    expect(x.admitted).toBe(false);
    expect(x.reason).toBe("D1_SHARED_DAILY_B2_QUOTA_HELD");
    expect(x.b2_requests).toBe(0);
    expect(x.rights_refresh_complete).toBe(false);
    expect(g.reserve).not.toHaveBeenCalled();
  });
  it("fails closed on stale, inconsistent or unverifiable shared-ledger status",async () => {
    const valid=ledger({GET:2,PUT:2,HEAD:0,NATIVE_AUTH:0});
    for(const bad of [
      {...valid,day_utc:"2026-10-10"},
      {...valid,schema:"some-invented-proof"},
      {...valid,account_wide_reporting_requires_all_clients_governed:false},
      {...valid,used:{...valid.used,total:1}},
      {...valid,limits:{...B2_DAILY_LIMITS,PUT:20000}},
      null,
    ]){
      const g=governor(bad);
      await expect(checkB2RightsOnlyHeadroom({governor:g,now}))
        .rejects.toThrow();
      expect(g.reserve).not.toHaveBeenCalled();
    }
  });
  it("wires the admission before either frozen source DB read or B2 PUT, never relaxes atomic tickets",()=>{
    const workflow=readFileSync(".github/workflows/b2-live-snapshot-maintenance.yml","utf8");
    const rights=workflow.slice(workflow.indexOf("  rights-only:\n"));
    const preflight=rights.indexOf("node scripts/ops/check-b2-rights-only-headroom.mjs");
    const source=rights.indexOf("bun scripts/ops/publish-b2-live-snapshots.ts rights-only");
    expect(preflight).toBeGreaterThan(0);
    expect(source).toBeGreaterThan(preflight);
    expect(rights).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(rights).toContain('B2_ACCOUNT_QUOTA_WORKFLOW_ID: rights_only_refresh');
    const checker=readFileSync("scripts/ops/check-b2-rights-only-headroom.mjs","utf8");
    expect(checker).toContain("createB2D1AccountGovernor");
    expect(checker).toContain("evaluateGovernedB2Headroom");
    expect(checker).not.toContain("globalAccountGovernor.reserve");
    const client=readFileSync("scripts/ops/b2-s3-client.mjs","utf8");
    expect(client).toContain("globalAccountGovernor.reserve(method)");
  });
});