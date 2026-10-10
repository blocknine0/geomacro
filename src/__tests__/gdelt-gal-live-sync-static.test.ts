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
  it("refreshes the canonical hot-topic discovery lane through controlled recovery without restoring a recurring schedule", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("permit_legacy_supabase_gal");
    expect(workflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("inputs.permit_legacy_supabase_gal == true");
    expect(workflow).not.toContain("schedule:");
    const orchestrator = readFileSync(join(process.cwd(), "scripts/intelligence-orchestrator.mjs"), "utf8");
    expect(orchestrator).toContain('key: "gdelt_gal"');
    expect(workflow).toContain("run-gdelt-gal-cycle.mjs");
    expect(audit).toContain("const PIPELINE_MAX_LAG_SECONDS = 30 * 60");
    expect(audit).toContain("const sourceStamp = cursor?.cursor?.last_source_stamp");
    expect(audit).toContain("source_lag_seconds: sourceLagSeconds");
    expect(audit).toContain("sourceLagSeconds <= PIPELINE_MAX_LAG_SECONDS");
    expect(audit).toContain('from("live_fragment_manifest")');
    expect(audit).toContain('from("live_structured_event_evidence")');
    expect(audit).toContain("latestFragmentEvidenceCount > 0");
    expect(audit).toContain("const pipelineHealthy = Boolean(");
  });

  it("validates the authoritative production target and bypasses restricted PostgREST egress without changing the data authority", () => {
    expect(workflow).toContain("node scripts/db/assert-authoritative-supabase.mjs");
    expect(workflow).toContain("LIVE_STRUCTURE_TOKEN");
    expect(workflow).toContain("APP_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("NODE_OPTIONS: --experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).not.toContain("LIVE_INGEST_TOKEN");
    expect(directSync).toContain('const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(directSync).toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("runs the exact canonical structuring source locally when the Supabase Edge runtime is quota-restricted", () => {
    const runner = readFileSync(join(process.cwd(), "scripts/run-live-structure-local.ts"), "utf8");
    const drain = readFileSync(join(process.cwd(), "scripts/drain-live-structure.mjs"), "utf8");
    expect(workflow).toContain("LIVE_STRUCTURE_EXECUTION_MODE: local_direct_postgres");
    expect(workflow).toContain("bun build scripts/run-live-structure-local.ts --target=node");
    expect(workflow).toContain("grep -q 'local_canonical_source_direct_postgres' gdelt-gal-cycle/structure.log");
    expect(runner).toContain('supabase/functions/live-structure-intelligence/index.ts');
    expect(runner).toContain('source.includes(\'const STRUCTURE_VERSION = "live-structure-v1.4.9"\')');
    expect(runner).toContain('import { createGriDbClient } from "./scripts/lib/gri-db-client.mjs";');
    expect(runner).toContain("LOCAL_STRUCTURER_TRANSFORM_ALIAS_MISMATCH");
    expect(runner).toContain("handleLiveStructureRequest");
    expect(drain).toContain('EXECUTION_MODE === "local_direct_postgres"');
    expect(drain).toContain('scripts/run-live-structure-local.ts');
    expect(drain).toContain("LIVE_STRUCTURE_LOCAL_FRAGMENT_INCOMPLETE");
  });

  it("keeps every database stage in the canonical cycle loader-compatible", () => {
    const cycle = readFileSync(join(process.cwd(), "scripts/run-gdelt-gal-cycle.mjs"), "utf8");
    const shim = readFileSync(join(process.cwd(), "scripts/lib/gri-db-client.mjs"), "utf8");
    expect(cycle).toContain('run("node", ["scripts/sync-gdelt-gal-production.mjs"]');
    expect(cycle).toContain('["--import", "tsx", "scripts/audit-agent-hot-topic-readiness.ts", "--require-pipeline-healthy"]');
    expect(cycle).toContain('run("node", ["scripts/reconcile-structured-event-commercial-rights.mjs"]');
    expect(cycle).toContain('["scripts/verify-gdelt-gal-cycle.mjs"]');
    expect(shim).toContain("upsert(payload, options = {})");
    expect(shim).toContain("DIRECT_POSTGRES_UPSERT_REQUIRES_ON_CONFLICT");
    expect(shim).toContain("#countSql()");
    expect(shim).toContain('String(this.selectOptions?.count ?? "").toLowerCase() === "exact"');
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
