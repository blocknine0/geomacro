import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("permanent 933 endpoint disposition contract", () => {
  const manifestLock = readFileSync(
    "config/source-endpoint-manifest-lock.json",
    "utf8",
  );
  const manifestScript = readFileSync(
    "scripts/source-endpoint-manifest.mjs",
    "utf8",
  );
  const probe = readFileSync(
    "scripts/probe-production-source-endpoints-933.mjs",
    "utf8",
  );
  const importer = readFileSync(
    "scripts/import-source-endpoint-evidence.mjs",
    "utf8",
  );
  const workflow = readFileSync(
    ".github/workflows/source-network-933-endpoint-disposition.yml",
    "utf8",
  );
  const migration = readFileSync(
    "supabase/migrations/070_permanent_endpoint_disposition_ledger.sql",
    "utf8",
  );

  it("locks the canonical endpoint manifest at exactly 933 URLs", async () => {
    const lock = JSON.parse(manifestLock);
    expect(lock.endpoint_count).toBe(933);
    expect(lock.manifest_sha256).toMatch(/^[0-9a-f]{64}$/);

    const module = await import("../../scripts/source-endpoint-manifest.mjs");
    const manifest = await module.collectMigrationEndpointManifest();
    expect(manifest.endpoint_count).toBe(933);
    expect(manifest.manifest_sha256).toBe(lock.manifest_sha256);
  });

  it("makes the probe exactly manifest-driven", () => {
    expect(probe).toContain('collectMigrationEndpointManifest');
    expect(probe).toContain('assertEndpointManifestLock');
    expect(probe).toContain('expected_endpoint_count: expectedCount');
    expect(probe).toContain("curl completed without an HTTP status");
    expect(probe).not.toContain("live_global_source_universe");
    expect(probe).not.toContain("live_external_sources");
    expect(probe).toContain("write_operations_performed: false");
  });

  it("persists every disposition in the permanent ledger", () => {
    expect(importer).toContain("live_source_endpoint_disposition_ledger");
    expect(importer).toContain("zero npm-package dependencies");
    expect(importer).toContain("endpoint_key");
    expect(importer).toContain('on_conflict=manifest_sha256%2Cendpoint_url');
    expect(importer).toContain("endpoint_disposition");
    expect(importer).toContain("matched_source_id");
    expect(importer).toContain("normalizeHttpUrl");
    expect(importer).toContain("invalid_source_url_values_skipped");
    expect(importer).not.toMatch(/certification_state\s*:/);

    expect(migration).toContain("live_source_endpoint_disposition_ledger");
    expect(migration).toContain("live_source_endpoint_manifest_lock");
    expect(migration).toContain("phase-b-933-v1");
  });

  it("makes the production gate fail closed at 933/933/0 unclassified", () => {
    expect(workflow).toContain("Verify canonical 933 endpoint manifest lock");
    expect(workflow).toContain("Import endpoint disposition evidence");
    expect(workflow).toContain("Verify permanent 933 endpoint disposition gate");
    expect(workflow).toContain("expected_endpoint_count");
    expect(workflow).toContain("unclassified_count");
    expect(workflow).toContain("endpoint_disposition_933_complete");
    expect(workflow).toContain("live_source_endpoint_manifest_lock");
    expect(workflow).toContain("live_source_endpoint_disposition_ledger");
  });

  it("never treats endpoint reachability as commercial certification", () => {
    expect(probe).toContain("never promotes a source");
    expect(importer).toContain("never promotes rights");
    expect(migration).not.toContain("certification_state = 'CERTIFIED'");
  });

  it("rejects a silently changed 933 manifest", () => {
    expect(manifestScript).toContain("assertEndpointManifestLock");
    expect(manifestScript).toContain("Endpoint manifest count drift");
    expect(manifestScript).toContain("Endpoint manifest hash drift");
  });
});
