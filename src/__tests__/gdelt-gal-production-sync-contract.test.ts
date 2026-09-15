import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("GDELT GAL production sync contract", () => {
  it("uses the authoritative server credential path without a missing invocation-token dependency", () => {
    const workflow = read(".github/workflows/gdelt-gal-live-sync.yml");
    const sync = read("scripts/sync-gdelt-gal-production.mjs");

    expect(workflow).toContain("scripts/sync-gdelt-gal-production.mjs");
    expect(workflow).not.toContain("LIVE_INGEST_TOKEN");
    expect(sync).toContain('const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(sync).toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(sync).toContain("Storage read-back failed");
    expect(sync).toContain('verification_method: "storage-readback-sha256"');
  });

  it("preserves bounded ingestion, deduplication and cursor health evidence", () => {
    const sync = read("scripts/sync-gdelt-gal-production.mjs");

    expect(sync).toContain("MAX_SOURCE_FILES_PER_RUN = 8");
    expect(sync).toContain("live_recent_fingerprints");
    expect(sync).toContain("live_fragment_manifest");
    expect(sync).toContain("live_ingestion_runs");
    expect(sync).toContain("last_success_at: nowIso");
    expect(sync).toContain('status: failures >= 3 ? "failed" : "degraded"');
  });

  it("keeps sanitized artifacts separate from raw source material", () => {
    const workflow = read(".github/workflows/gdelt-gal-live-sync.yml");

    expect(workflow).toContain("gdelt-gal-sync-summary.ndjson");
    expect(workflow).toContain("structure-sync-summary.ndjson");
    expect(workflow).toContain("agent-hot-topic-readiness-after-sync.json");
    expect(workflow).not.toContain("*.ndjson.gz");
  });
});
