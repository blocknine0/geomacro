import { describe, expect, it } from "vitest";
import fs from "node:fs";

const workflow = fs.readFileSync(
  ".github/workflows/converge-early-warning-market-impact-production.yml",
  "utf8",
);
const sql = fs.readFileSync(
  "scripts/ops/converge-early-warning-market-impact.sql",
  "utf8",
);

describe("Early Warning market-impact production convergence", () => {
  it("is narrow, authoritative-project-only and push-gated on main", () => {
    expect(workflow).toContain("ldpwajisioljyjtojvfx");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain(
      "psql \"$SUPABASE_DB_URL\" -X -v ON_ERROR_STOP=1 -f scripts/ops/converge-early-warning-market-impact.sql",
    );
    expect(workflow).not.toContain("supabase db push");
    expect(workflow).not.toContain("supabase migration repair");
  });

  it("requires the public Edge feed to be healthy rather than hiding degradation", () => {
    expect(workflow).toContain("body?.degraded !== false");
    expect(workflow).toContain("public Early Warning remains degraded");
    expect(workflow).toContain("private field leaked");
    expect(workflow).toContain("public_edge_degraded: false");
  });

  it("converges only the intended schema and preserves private table access", () => {
    for (const column of [
      "market_impact jsonb",
      "market_impact_methodology_version text",
      "market_impact_calibrated boolean not null default false",
      "market_impact_hash text",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql).toContain("early_warning_market_impact_object_check");
    expect(sql).toContain("early_warning_market_impact_binding_check");
    expect(sql).toContain("create or replace function public.guard_published_early_warning_core()");
    expect(sql).toContain(
      "revoke all on function public.guard_published_early_warning_core() from PUBLIC, anon, authenticated;",
    );
    expect(sql).not.toMatch(/grant\s+.*early_warning_alerts\s+to\s+(?:PUBLIC|anon|authenticated)/i);
    expect(workflow).toContain("not has_table_privilege('anon', 'public.early_warning_alerts', 'SELECT')");
    expect(workflow).toContain("not has_table_privilege('authenticated', 'public.early_warning_alerts', 'SELECT')");
  });

  it("does not activate payment, settlement, execution or mainnet behavior", () => {
    expect(workflow).toContain("production_payment_or_mainnet_activation: false");
    expect(sql).not.toMatch(/\b(payment|settlement|mainnet|execution_authorized)\b/i);
  });
});
