import fs from "node:fs";
import { describe, expect, it } from "vitest";

const mesh = fs.readFileSync("scripts/sync-open-live-source-mesh.mjs", "utf8");
const workflow = fs.readFileSync(".github/workflows/open-realtime-source-mesh.yml", "utf8");
const sourceMigration = fs.readFileSync("supabase/migrations/964_stage1_realtime_source_mesh.sql", "utf8");
const providerMigration = fs.readFileSync("supabase/migrations/965_stage1_provider_expansion_catalog.sql", "utf8");

describe("Stage 1 realtime source mesh", () => {
  it("contains multiple independent non-GDELT source adapters", () => {
    expect(mesh).toContain("sourceRecordsUsGs");
    expect(mesh).toContain("sourceRecordsGdacs");
    expect(mesh).toContain("sourceRecordsNasaFirms");
    expect(mesh).toContain("sourceRecordsReliefWeb");
    expect(mesh).toContain("sealSource");
  });

  it("seals normalized fragments with hash/read-back verification", () => {
    expect(mesh).toContain("compressed_sha256");
    expect(mesh).toContain("Storage verification mismatch");
    expect(mesh).toContain("live_fragment_manifest");
    expect(mesh).toContain("live_ingestion_cursors");
  });

  it("never makes optional premium sources live without explicit activation", () => {
    expect(providerMigration).toContain("enabled");
    expect(providerMigration).toContain("false");
    expect(providerMigration).toContain("connector_status");
    expect(providerMigration).toContain("REVIEW_REQUIRED");
    expect(providerMigration).toContain("DATAMINR_API_TOKEN");
    expect(providerMigration).toContain("KPLER_API_CREDENTIAL");
  });

  it("is operator-only because the master orchestrator owns cadence", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    const orchestrator = fs.readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
    expect(orchestrator).toContain('key: "open_realtime_mesh"');
    expect(workflow).toContain("scripts/sync-open-live-source-mesh.mjs");
    expect(workflow).toContain("live-structure-intelligence");
  });

  it("keeps source identities server-side", () => {
    expect(sourceMigration).toContain("raw_storage_policy");
    expect(sourceMigration).toContain("internal_only");
    expect(workflow).toContain("operational evidence");
  });

  it("registers the expanded open and premium source mesh without exposing it in product responses", () => {
    expect(sourceMigration).toContain("usgs_earthquakes");
    expect(sourceMigration).toContain("gdacs_global_disasters");
    expect(sourceMigration).toContain("reliefweb_reports");
    expect(providerMigration).toContain("dataminr_first_alert");
    expect(providerMigration).toContain("eventregistry_news");
    expect(providerMigration).toContain("reuters_lseg_news");
    expect(providerMigration).toContain("tradingeconomics_macro");
    expect(providerMigration).toContain("fastmarkets_critical_minerals");
    expect(providerMigration).toContain("argus_critical_minerals");
    expect(providerMigration).toContain("kpler_commodity_flows");
    expect(providerMigration).toContain("windward_maritime_ai");
    expect(providerMigration).toContain("spire_maritime_ais");
  });
});
