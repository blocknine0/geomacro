import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("private Supabase runtime audit workflow contract", () => {
  it("is manually executable against only the authoritative production Supabase project", () => {
    const workflow = read(".github/workflows/private-supabase-runtime-audit.yml");

    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("ldpwajisioljyjtojvfx");
    expect(workflow).toContain("scripts/db/assert-authoritative-supabase.mjs");
    expect(workflow).toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the runtime audit read-only and evidence-bounded", () => {
    const workflow = read(".github/workflows/private-supabase-runtime-audit.yml");
    const runtimeAudit = read("scripts/audit-global-raw-source-runtime.mjs");
    const diagnostic = read("scripts/diagnose-live-structure-runtime.mjs");

    expect(workflow).toContain("scripts/audit-global-raw-source-runtime.mjs");
    expect(workflow).toContain("scripts/diagnose-live-structure-runtime.mjs");
    expect(workflow).toContain("Upload private runtime evidence");
    expect(runtimeAudit).toContain('enabled_countries:countryCount');
    expect(diagnostic).toContain("detail_fingerprint");
    expect(diagnostic).not.toContain("console.log(JSON.stringify(latest.error_detail");
    expect(workflow).not.toContain("supabase db push");
    expect(workflow).not.toContain(".insert(");
    expect(workflow).not.toContain(".upsert(");
    expect(workflow).not.toContain(".update(");
    expect(workflow).not.toContain(".delete(");
  });
});
