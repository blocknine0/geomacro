import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const read=(file:string)=>readFileSync(file,"utf8");

describe("#2124 one-shot production audit cannot regress previously accepted serving",()=>{
  const workflow=read(".github/workflows/issue-2124-b2-d1-current-audit.yml");
  it("only auto-runs on the single recovery workflow main merge or manual dispatch",()=>{
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain("  push:");
    expect(workflow).toContain("    branches: [main]");
    expect(workflow).toContain("'.github/workflows/issue-2124-b2-d1-current-audit.yml'");
    expect(workflow).not.toMatch(/^  schedule:/m);
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("ref: ${{ github.sha }}");
  });
  it("keeps B2 quota protected, read-only and founder-approval guarded",()=>{
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_REQUIRED: '1'");
    expect(workflow).toContain("B2_REQUEST_BUDGET: '8'");
    expect(workflow).toContain("B2_ARCHIVE_READ_KEY_ID");
    const gate=workflow.indexOf("Gate current-hot B2 archive GET on source-native D1 metadata");
    const budget=workflow.indexOf("Fail closed without B2 GET headroom");
    const getter=workflow.indexOf("B2 archive exact readback and D1 current hash comparison");
    expect(gate).toBeGreaterThan(-1);
    expect(budget).toBeGreaterThan(gate);
    expect(getter).toBeGreaterThan(budget);
    expect(workflow).toContain("node scripts/ops/classify-d1-hot-metadata.mjs");
    expect(workflow).toContain("P0_NO_CURRENT_HOT_INPUT_DO_NOT_WASTE_B2_GET");
    expect(workflow).toContain("length(CAST(payload_json AS BLOB)) AS payload_bytes");
    expect(workflow).not.toContain("SELECT * FROM public_b2_hot_snapshot");
    expect(workflow).toContain("artifacts/public-serving/d1-metadata.json");
    const quota=read(".github/workflows/b2-account-readonly-quota-receipt.yml");
    expect(quota).toContain("geomacro.p0-hot-503-readonly-quota-decision.v1");
    expect(quota).toContain("current_hot_eight_get_headroom_present");
    expect(quota).not.toContain("secrets.B2_");
    expect(workflow).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("issues: write");
    expect(workflow).not.toContain("SUPABASE_DB_URL");
    expect(workflow).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(workflow).not.toContain("on: schedule");
    const audit=read("scripts/ops/audit-b2-d1-current-hot-readonly.mjs");
    expect(audit).toContain("readback_verified:true");
    expect(audit).toContain('commercial_acceptance:false');
    expect(audit).toContain("supabase_requests:0");
    expect(audit).toContain("payments:0");
  });
  it("preserves website 15-minute delay and original 60-minute GRI delay",()=>{
    expect(read("workers/control-plane/src/website-derived-intelligence.mjs"))
      .toContain("const DELAY_MS = 15 * 60_000;");
    expect(read("workers/control-plane/src/website-gri-history.mjs"))
      .toContain("export const WEBSITE_GRI_DELAY_MS=60*60*1000;");
  });
  it("does not mislabel legacy health or charge x402 on missing signed evidence",()=>{
    const health=read("src/routes/api.health.ts");
    expect(health).toContain("status: deepReady ? 200 : 503");
    expect(health).toContain("snapshot.full_b2_readback_verified === true");
    expect(health).toContain("supabase_required_for_serving: false");
    const noFunds=read("scripts/ops/verify-failed-health-x402-no-funds.mjs");
    expect(noFunds).toContain("a?.payment_required_now===false");
    expect(noFunds).toContain("a?.execution_authorized===false");
    expect(noFunds).toContain("real_funds_touched:false");
  });
});
