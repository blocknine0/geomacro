import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

describe("#1827 real governed B2 archive D1-v5 contract preflight", () => {
  const wf = readFileSync(".github/workflows/governed-source-ingestion.yml", "utf8");
  const testSource = readFileSync("scripts/test-governed-source-ingestion.mjs", "utf8");
  const ingestSource = readFileSync("scripts/ingest-certified-sources.mjs", "utf8");

  it("executes the actual production pre-B2 static self-test in CI (not only text snapshots)", () => {
    const test = spawnSync(process.execPath, ["scripts/test-governed-source-ingestion.mjs"], {
      encoding: "utf8", timeout: 15_000,
      env: { PATH: process.env.PATH },
    });
    expect(test.status, test.stderr || test.stdout).toBe(0);
    expect(test.stdout).toContain("PASS: governed Supabase-free compressed B2-fragment ingestion contract");
  });

  it("requires schema v5 and shared account quota table BEFORE source access or B2", () => {
    expect(wf).toContain("Require D1 schema v5 and account B2 quota ledger before source reads");
    expect(wf).toContain("Number(rows[0]?.version) < 5");
    expect(wf).toContain("Number(rows[0]?.quota_table) !== 1");
    expect(wf).toContain("GOVERNED_INGESTION_SHARED_B2_D1_SCHEMA_V5_REQUIRED");
    expect(testSource).toContain('"Number(rows[0]?.version) < 5"');
    expect(testSource).not.toContain('"Number(row?.version) >= 2"');
    const preflight = wf.indexOf("Require D1 schema v5 and account B2 quota ledger before source reads");
    const sources = wf.indexOf("Export governed source admission state from D1");
    const archive = wf.indexOf("Run governed B2-first ingestion");
    expect(preflight).toBeGreaterThan(0);
    expect(sources).toBeGreaterThan(preflight);
    expect(archive).toBeGreaterThan(sources);
  });

  it("reserves account-wide D1 B2 quota and refuses any ungoverned private write", () => {
    expect(wf).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(wf).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: governed_source_ingestion");
    expect(wf).toContain('echo "D1_DATABASE_ID=$DB_ID" >> "$GITHUB_ENV"');
    expect(wf).toContain("GOVERNED_B2_SHARED_ACCOUNT_QUOTA_NOT_ACTIVE");
    expect(ingestSource).toContain('process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1"');
    expect(ingestSource).toContain('process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "governed_source_ingestion"');
    expect(ingestSource).toContain("GOVERNED_INGESTION_B2_SHARED_ACCOUNT_QUOTA_REQUIRED");
    expect(ingestSource.indexOf("GOVERNED_INGESTION_B2_SHARED_ACCOUNT_QUOTA_REQUIRED"))
      .toBeLessThan(ingestSource.indexOf("const b2 = createB2Client"));
    expect(wf).not.toContain("Replay governed normalized ingestion");
  });
});
