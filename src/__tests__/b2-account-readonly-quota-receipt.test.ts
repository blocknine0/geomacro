import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseB2QuotaWranglerReport } from "../../scripts/ops/report-b2-account-ledger-readonly.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const now=new Date("2026-10-10T16:00:00.000Z");
const row={
  day_utc:"2026-10-10",
  total_requests:8,get_requests:3,put_requests:5,head_requests:0,native_auth_requests:0,
};
function wrap(rows:unknown[]) {
  return JSON.stringify([{success:true,results:rows}]);
}
describe("#1827 bounded B2 D1 reservation-account audit", () => {
  it("reports only the D1 ledger's actually reserved bytes/operation budget, not provider billing", () => {
    const result=parseB2QuotaWranglerReport(wrap([
      {...row,workflow_id:"intelligence_orchestrator",operation:"GET",workflow_requests:2},
      {...row,workflow_id:"intelligence_orchestrator",operation:"PUT",workflow_requests:4},
      {...row,workflow_id:"global_risk_edge",operation:"GET",workflow_requests:1},
    ]),{now});
    expect(result.status).toBe("D1_LEDGER_OBSERVED");
    expect(result.reserved).toEqual({total:8,GET:3,PUT:5,HEAD:0,NATIVE_AUTH:0});
    expect(result.unattributed_reserved).toBe(1);
    expect(result.limits).toEqual(B2_DAILY_LIMITS);
    expect(result.provider_account_usage_verified).toBe(false);
    expect(result.all_external_clients_governed_independently_verified).toBe(false);
    expect(result.commercial_eligibility_verified).toBe(false);
    expect(result.b2_requests).toBe(0);
    expect(result.d1_writes).toBe(0);
    expect(result.payment_performed).toBe(false);
  });

  it("never invents zero provider usage when the current UTC ledger row is missing", () => {
    const result=parseB2QuotaWranglerReport(wrap([]),{now});
    expect(result.status).toBe("UNKNOWN_NO_D1_LEDGER_ROW");
    expect(result.ledger_observed).toBe(false);
    expect(result.reserved).toBeNull();
    expect(result.per_workflow).toBeNull();
  });

  it("supports a valid account row without per-workflow receipts but calls it unattributed", () => {
    const result=parseB2QuotaWranglerReport(wrap([
      {...row,workflow_id:null,operation:null,workflow_requests:0},
    ]),{now});
    expect(result.ledger_observed).toBe(true);
    expect(result.unattributed_reserved).toBe(8);
    expect(result.per_workflow).toEqual([]);
  });

  it("rejects forged/mixed-day/duplicate/malformed/overflow ledgers", () => {
    const valid={...row,workflow_id:"a_writer",operation:"GET",workflow_requests:3};
    const cases=[
      [{...valid,day_utc:"2026-10-09"}],
      [{...valid,total_requests:123}],
      [{...valid,workflow_id:"../../private"}],
      [{...valid,operation:"READ"}],
      [valid,valid],
      [valid,{...valid,put_requests:4,workflow_id:"b_writer"}],
      [{...valid,workflow_requests:4}],
      [{...valid,workflow_requests: -1}],
      [{...valid,get_requests:26,total_requests:31,put_requests:5}],
      [{...valid,total_requests:9007199254740992}],
      Array(101).fill(valid),
    ];
    for(const test of cases) expect(()=>parseB2QuotaWranglerReport(wrap(test),{now})).toThrow();
    expect(()=>parseB2QuotaWranglerReport("not-json",{now})).toThrow();
    expect(()=>parseB2QuotaWranglerReport(JSON.stringify([{success:false,results:[valid]}]),{now})).toThrow();
  });

  it("hard-locks the production workflow to one SELECT and no B2 or Supabase secrets", () => {
    const workflow=readFileSync(".github/workflows/b2-account-readonly-quota-receipt.yml","utf8");
    expect(workflow).toContain("SELECT a.day_utc,a.total_requests");
    expect(workflow).toContain("LIMIT 101;");
    expect(workflow).toContain("d1 execute geomacro-control-plane");
    expect(workflow).toContain("node scripts/ops/report-b2-account-ledger-readonly.mjs");
    expect(workflow).not.toContain("secrets.B2_");
    expect(workflow).not.toContain("secrets.SUPABASE");
    expect(workflow).not.toContain("d1 migrations apply");
    expect(workflow).not.toContain("wrangler deploy");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
  });
});
