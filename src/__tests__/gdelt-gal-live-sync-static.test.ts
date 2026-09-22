import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/gdelt-gal-live-sync.yml"),
  "utf8",
);

const audit = readFileSync(
  join(process.cwd(), "scripts/audit-agent-hot-topic-readiness.ts"),
  "utf8",
);

const directSync = readFileSync(
  join(process.cwd(), "scripts/sync-gdelt-gal-production.mjs"),
  "utf8",
);

describe("GDELT GAL production freshness workflow", () => {
  it("refreshes the canonical hot-topic discovery lane often enough for the paid freshness contract", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    const orchestrator = readFileSync(join(process.cwd(), "scripts/intelligence-orchestrator.mjs"), "utf8");
    expect(orchestrator).toContain('key: "gdelt_gal"');
    expect(workflow).toContain("run-gdelt-gal-cycle.mjs");
    expect(workflow).not.toContain("schedule:");
    expect(audit).toContain("const PIPELINE_MAX_LAG_SECONDS = 30 * 60");
  });

  it("validates the authoritative production target and uses only configured scoped credentials", () => {
    expect(workflow).toContain("node scripts/db/assert-authoritative-supabase.mjs");
    expect(workflow).toContain("LIVE_STRUCTURE_TOKEN");
    expect(workflow).toContain("APP_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).not.toContain("LIVE_INGEST_TOKEN");
    expect(directSync).toContain('const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(directSync).toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("reconciles eligibility only from the authoritative provenance evaluation", () => {
    const cycle = readFileSync(join(process.cwd(), "scripts/run-gdelt-gal-cycle.mjs"), "utf8");
    expect(cycle).toContain("reconcile-structured-event-commercial-rights.mjs");
    expect(cycle).toContain("scripts/verify-gdelt-gal-cycle.mjs");
  });

  it("fails the acceptance proof when the paid hot-topic boundary is unhealthy", () => {
    const cycle = readFileSync(join(process.cwd(), "scripts/run-gdelt-gal-cycle.mjs"), "utf8");
    const verifier = readFileSync(join(process.cwd(), "scripts/verify-gdelt-gal-cycle.mjs"), "utf8");
    expect(cycle).toContain("audit-agent-hot-topic-readiness.ts");
    expect(verifier).toContain("pipeline.healthy=true");
    expect(workflow).toContain(".verification.acceptance.hot_topic_pipeline_healthy == true");
    expect(workflow).toContain(".verification.acceptance.structured_event_rights_reconciled == true");
    expect(workflow).toContain(".verification.acceptance.writes_performed_by_verifier == false");
  });
});
