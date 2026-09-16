import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/gdelt-gal-live-sync.yml"),
  "utf8",
);

const nativeDeploy = readFileSync(
  join(process.cwd(), ".github/workflows/deploy-gdelt-native-pipeline.yml"),
  "utf8",
);

const nativeMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/939_gdelt_native_pipeline_scheduler.sql"),
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
  it("moves scheduled mutation to Supabase native cron and keeps GitHub as manual fallback", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("sync-gdelt-gal-production.mjs");
    expect(workflow).toContain("live-structure-intelligence");

    expect(nativeMigration).toContain("geomacro-gdelt-native-pipeline-10m");
    expect(nativeMigration).toContain("3,13,23,33,43,53 * * * *");
    expect(nativeMigration).toContain("public.invoke_gdelt_native_pipeline()");
    expect(nativeDeploy).toContain("install_gdelt_native_pipeline_cron");
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
    expect(nativeMigration).toContain("live_structured_event_commercial_rights_evaluation");
    expect(nativeMigration).toContain("reconcile_live_structured_event_commercial_rights");
  });

  it("fails the manual acceptance proof when the paid hot-topic boundary is unhealthy", () => {
    expect(workflow).toContain("audit-agent-hot-topic-readiness.ts --require-pipeline-healthy");
    expect(workflow).toContain(".pipeline.healthy == true");
    expect(workflow).toContain(".claim_boundary.raw_source_material_redistributed == false");
    expect(workflow).toContain(".claim_boundary.only_verified_or_derived_only_structured_events_are_deliverable == true");
  });
});
