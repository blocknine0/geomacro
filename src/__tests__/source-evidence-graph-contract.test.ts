import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/961_source_certification_evidence_graph.sql"),
  "utf8",
);
const runtimeMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/962_source_runtime_evidence_snapshot.sql"),
  "utf8",
);
const script = fs.readFileSync(
  path.join(root, "scripts/source-certification-evidence-graph.mjs"),
  "utf8",
);
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/source-evidence-graph-auto-promotion.yml"),
  "utf8",
);

describe("permanent source evidence graph", () => {
  it("defines the complete source evidence graph and guarded promotion RPC", () => {
    for (const token of [
      "live_source_certification_evidence_runs",
      "live_source_certification_evidence_nodes",
      "live_source_certification_evidence_edges",
      "promote_source_certification_from_evidence_graph",
      "promote_source_certification_evidence_graph_run",
      "EVIDENCE_GRAPH_INCOMPLETE",
      "if rights_value not in ('COMMERCIAL_OK','DERIVED_ONLY')",
    ]) {
      expect(migration).toContain(token);
    }
    for (const dimension of [
      "REGISTRY","ENDPOINT","RIGHTS","SCHEMA","FRESHNESS",
      "PROVENANCE","INDEPENDENCE","ADAPTER","RUNTIME","FALLBACK",
    ]) {
      expect(migration).toContain("'" + dimension + "'");
    }
  });

  it("keeps runtime evidence structured and internal", () => {
    expect(runtimeMigration).toContain("live_source_runtime_evidence_snapshot");
    expect(runtimeMigration).toContain("observations_with_source_url");
    expect(runtimeMigration).not.toContain("grant select on public.live_external_observations");
  });

  it("never promotes from endpoint reachability or registry metadata alone", () => {
    expect(script).toContain("Rights are never inferred from endpoint reachability.");
    expect(script).toContain("reviewed-commercial-source-rights-manifest");
    expect(script).toContain("official-surface-rights-crawler");
    expect(script).toContain("promote_source_certification_evidence_graph_run");
    expect(script).not.toContain("enabled_for_commercial_signals = true");
    expect(script).not.toContain("enabled_for_ingestion = true");
  });

  it("runs permanently against authoritative production after successful DB deploy", () => {
    expect(workflow).toContain('workflows: ["Deploy country flash intelligence to Supabase"]');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx");
    expect(workflow).toContain("bun run source:certification:evidence-graph");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
  });
});
