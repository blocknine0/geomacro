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
    expect(workflow).toContain('cron: "4,19,34,49 * * * *"');
    expect(workflow).toContain("sync-gdelt-gal-production.mjs");
    expect(workflow).toContain("live-structure-intelligence");
    expect(audit).toContain("const PIPELINE_MAX_LAG_SECONDS = 30 * 60");
  });

  it("validates the authoritative production target and uses only configured scoped credentials", () => {
    expect(workflow).toContain("node scripts/db/assert-authoritative-supabase.mjs");
    expect(workflow).toContain("LIVE_STRUCTURE_TOKEN");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("LIVE_INGEST_TOKEN");
    expect(directSync).toContain('const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(directSync).toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("reconciles eligibility only from the authoritative provenance evaluation", () => {
    expect(workflow).toContain("live_structured_event_commercial_rights_evaluation");
    expect(workflow).toContain("commercial_eligibility_status: row.evaluated_status");
    expect(workflow).toContain("commercial_eligibility_reason_codes: row.reason_codes ?? []");
  });

  it("fails the acceptance proof when the paid hot-topic boundary is unhealthy", () => {
    expect(workflow).toContain("audit-agent-hot-topic-readiness.ts --require-pipeline-healthy");
    expect(workflow).toContain(".pipeline.healthy == true");
    expect(workflow).toContain(".claim_boundary.raw_source_material_redistributed == false");
    expect(workflow).toContain(".claim_boundary.only_verified_or_derived_only_structured_events_are_deliverable == true");
  });
});
