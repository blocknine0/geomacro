import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/day6-authorized-federico-pilot-once.yml",
  "utf8",
);

describe("one-time Day 6 Federico pilot authorization", () => {
  it("refreshes and proves local readiness before partner allowance", () => {
    const refresh = workflow.indexOf("Re-poll governed RSS without partner allowance");
    const corroborate = workflow.indexOf("Corroborate candidates and select first genuinely strict-ready country");
    const local = workflow.indexOf("Dispatch no-allowance current-head local assurance");
    const live = workflow.indexOf("Dispatch exactly one authorized Federico pilot allowance review");
    expect(refresh).toBeGreaterThan(-1);
    expect(corroborate).toBeGreaterThan(refresh);
    expect(local).toBeGreaterThan(corroborate);
    expect(live).toBeGreaterThan(local);
    expect(workflow).toContain("use_partner_allowance=false");
    expect(workflow).toContain("use_partner_allowance=true");
    expect(workflow).toContain("node scripts/run-rss-live-cycle.mjs");
    expect(workflow).toContain("scripts/run-live-flash-corroborate-local.ts");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).not.toContain(".supabase.co/functions/v1/");
    expect(workflow).not.toContain("ACTIONS_ID_TOKEN_REQUEST_URL");
  });

  it("does not authorize user funds or irreversible execution", () => {
    expect(workflow).toContain('"user_funds_authorized":false');
    expect(workflow).toContain('"real_money_payment_authorized":false');
    expect(workflow).toContain('"execution_authorized":false');
    expect(workflow).toContain("github.run_attempt == 1");
  });

  it("pins both child assurance runs to the parent SHA and exact artifact contract", () => {
    expect(workflow).toContain('-f candidate_sha="$MAIN_SHA" -f use_partner_allowance=false');
    expect(workflow).toContain('-f candidate_sha="$MAIN_SHA" -f use_partner_allowance=true');
    expect(workflow).toContain("--json databaseId,createdAt,displayTitle,status");
    expect(workflow).not.toContain("--json databaseId,createdAt,headSha,status");
    expect(workflow).toContain("day6-global-partner-assurance-${RUN_ID}");
    expect(workflow).not.toContain("federico-handoff-${RUN_ID}");
    expect(workflow).toContain('RSS_LIVE_SKIP_CORROBORATION: "true"');
    expect(workflow).toContain('.corroboration.skipped == true');
    expect(workflow).toContain('explicit_partner_bootstrap_country_corroboration_follows');
  });
});
