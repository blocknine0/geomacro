import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync("src/routes/api.early-warning.ts", "utf8");
const edge = fs.readFileSync("supabase/functions/public-early-warning/index.ts", "utf8");
const workflow = fs.readFileSync(
  ".github/workflows/deploy-public-early-warning-edge.yml",
  "utf8",
);
const ledgerMigration = fs.readFileSync(
  "supabase/migrations/937_early_warning_alert_ledger.sql",
  "utf8",
);

describe("public Early Warning production read boundary", () => {
  it("removes the Lovable service-role dependency from the public route", () => {
    expect(route).toContain(
      "https://ldpwajisioljyjtojvfx.supabase.co/functions/v1/public-early-warning",
    );
    expect(route).toContain("boundedPublicEarlyWarningRow");
    expect(route).toContain("AbortSignal.timeout");
    expect(route).not.toContain("requireRiskSupabase()");
    expect(route).not.toContain("loadPublicEarlyWarningFeed({");
  });

  it("keeps the authoritative Edge Function bounded, read-only and public-only", () => {
    expect(edge).toContain('.from("early_warning_alerts")');
    expect(edge).toContain('.eq("visibility", "public")');
    expect(edge).toContain('.eq("public_eligible", true)');
    expect(edge).toContain('.eq("content_type", "early_warning")');
    expect(edge).toContain('.in("status", PUBLIC_STATUSES)');
    expect(edge).toContain('.limit(limit)');
    expect(edge).not.toMatch(/\.(insert|upsert|update|delete)\(/);

    for (const privateField of [
      "cews_inputs",
      "cews_contributions",
      "evidence_refs",
      "source_event_ids",
      "outcome_evidence_refs",
      "early_warning_distribution_receipts",
    ]) {
      expect(edge).not.toContain(privateField);
    }
  });

  it("keeps the core public feed available when the optional market-impact schema extension is unavailable", () => {
    expect(edge).toContain("CORE_PUBLIC_SELECT");
    expect(edge).toContain("EXTENDED_PUBLIC_SELECT");
    expect(edge).toContain("optional extended feed read failed; retrying core bounded feed");
    expect(edge).toContain('degraded_reason: "optional_market_impact_extension_unavailable"');
    expect(edge).toContain("market_impact: null");
    expect(edge).toContain("market_impact_methodology_version: null");
    expect(edge).toContain("market_impact_calibrated: false");
    expect(edge).toContain("market_impact_hash: null");
    expect(edge).toContain("if (core.error)");
    expect(edge).toContain('return json(503, { ok: false, code: "feed_unavailable" })');
  });

  it("preserves service-role-only table access instead of opening anon RLS", () => {
    expect(ledgerMigration).toContain(
      "revoke all on table public.early_warning_alerts from PUBLIC, anon, authenticated;",
    );
    expect(ledgerMigration).toContain(
      "grant all on table public.early_warning_alerts to service_role;",
    );
  });

  it("deploys only to the authoritative project and verifies the live bounded payload", () => {
    expect(workflow).toContain("ldpwajisioljyjtojvfx");
    expect(workflow).toContain("supabase functions deploy public-early-warning");
    expect(workflow).toContain("--no-verify-jwt");
    expect(workflow).toContain("version: 2.117.0");
    expect(workflow).toContain("public-early-warning-edge-v1");
    expect(workflow).toContain("non-public row leaked");
    expect(workflow).toContain("private field leaked");
  });
});
