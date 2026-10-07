import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("config/production-history-only-migrations.json", "utf8"));
const lineEndings = JSON.parse(readFileSync("config/production-history-line-endings.json", "utf8"));
const validator = readFileSync("scripts/db/production-history-only.mjs", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy-country-flash-supabase.yml", "utf8");

const restored = new Map([
  ["20261005164339_telegram_authorized_publisher_boundary.sql", "e2215181651a127205532e7809ba0e3e7f62e3cb5361c89210cea666b2810576"],
  ["20261005164950_telegram_boundary_constraints.sql", "a7b5362ad55ee78f9c75048af481d82d4d0112e26cf9ff4fecca235f2e75ee24"],
  ["20261005165318_telegram_activation_guard.sql", "0c4340e826c957cf7df7a62fb41a2f88730d6a97f082980f7d0ba82771fc96f1"],
  ["20261005165446_telegram_global_candidate_registry_and_event_guard.sql", "041fd842c4d229816c8bca91f0534df93281c6f432ce922bfd1f3c2bf63a1846"],
  ["20261005165846_telegram_raw_event_ingest_guard.sql", "80443b018453dcef9ee9d53811069cf11bc5863b95be7e5c6fce5589f44799d2"],
  ["20261005172113_telegram_authorized_channel_key_compatibility.sql", "77e48c20e51143dae9fb131d4810d36f64975298761ce22455a05c41f5a52db1"],
  ["20261005181016_telegram_authorized_feed_activation_sync.sql", "887086f57b25ec8225a0f5d8bab5b8dc8379b797d501002ad422aee162f7297e"],
  ["20261006062153_canonicalize_free_tier_budget_modes.sql", "ec975784e067cbc933a3066d0109e7649344d0e24f0acb9db7b06a68bd2b7a2b"],
  ["20261006175608_open_derived_commercial_rights_gate.sql", "ccfd04a2e0f91cbf39b61cbe2ea622bed269bdc827ec7249217bcba78076b52d"],
  ["20261007094303_repair_commercial_source_alignment_runtime_drift.sql", "14848b6e1b290008649b8e72b598180c8226bdd1910a5f3751e82ac25476ce8f"],
]);

describe("production migration history parity", () => {
  it("hash-pins every newly restored production-only migration", () => {
    expect(manifest.migrations).toHaveLength(56);
    const byFile = new Map(manifest.migrations.map((row: { file: string; sha256: string }) => [row.file, row.sha256]));
    for (const [file, sha256] of restored) {
      expect(byFile.get(file)).toBe(sha256);
      expect(readFileSync("supabase/migrations/" + file, "utf8").length).toBeGreaterThan(0);
    }
  });

  it("tracks production terminal-LF metadata without a hard-coded validator count", () => {
    expect(lineEndings.migration_count).toBe(manifest.migrations.length);
    expect(lineEndings.ends_with_lf).toEqual(expect.arrayContaining([
      "20261005165446",
      "20261006062153",
      "20261007094303",
    ]));
    expect(validator).not.toContain("migrations.length !== 46");
    expect(validator).toContain("metadata.migration_count !== expectedCount");
  });

  it("verifies immutable history before Supabase planning or apply", () => {
    const verifyPos = deployWorkflow.indexOf("production-history-only.mjs verify");
    const planPos = deployWorkflow.indexOf("Show pending database migrations");
    expect(verifyPos).toBeGreaterThan(-1);
    expect(planPos).toBeGreaterThan(verifyPos);
  });
});
