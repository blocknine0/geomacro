import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = fs.readFileSync(
  path.join(root, "scripts/ops/reconcile-production-source-certification.mjs"),
  "utf8",
);
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/source-evidence-graph-auto-promotion.yml"),
  "utf8",
);

describe("production source alignment", () => {
  it("uses the direct production database rather than the Supabase Data API", () => {
    expect(script).toContain('const DB_URL = String(process.env.SUPABASE_DB_URL');
    expect(script).toContain('"psql"');
    expect(script).not.toContain("@supabase/supabase-js");
    expect(script).not.toContain("createClient(");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("APP_SUPABASE_URL");
  });

  it("keeps certification fail-closed and preserves existing certified sources", () => {
    expect(script).toContain("c.certification_state <> 'CERTIFIED'");
    expect(script).toContain("c.certification_state='NOT_STARTED'");
    expect(script).toContain("set certification_state='IN_REVIEW'");
    expect(script).not.toContain("set certification_state='CERTIFIED'");
    expect(script).toContain("Only the guarded evidence-graph promotion function may set CERTIFIED");
  });

  it("closes active endpoint dangling states without mutating the frozen 933 census", () => {
    expect(script).toContain("danglingActive");
    expect(script).toContain("active_unclassified_count");
    expect(script).toContain("frozen_endpoint_933_census_mutated = false");
    expect(script).not.toContain("live_source_endpoint_disposition_ledger");
    expect(script).not.toContain("live_source_endpoint_manifest_lock");
  });

  it("accounts for every certification path and rejects unsafe path states", () => {
    expect(script).toContain("invalid_path_state_count");
    expect(script).toContain("certified_path_count");
    expect(script).toContain("fail_closed_path_count");
    expect(script).toContain("Certification path accounting is incomplete");
  });

  it("runs on exact main changes and at low recurring frequency", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('- main');
    expect(workflow).toContain('cron: "27 2 * * 0"');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
  });
});
