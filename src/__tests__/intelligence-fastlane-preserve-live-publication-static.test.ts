import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sync = readFileSync("scripts/ops/sync-fastlane-scored-intelligence.mjs", "utf8");
const preserve = readFileSync("scripts/ops/republish-b2-public-intelligence-preserve-live.mjs", "utf8");
const refresh = readFileSync(".github/workflows/intelligence-scored-refresh.yml", "utf8");

describe("#1414 fastlane scored catch-up with verified live preservation", () => {
  it("uses preservation only for bounded GDELT availability exhaustion", () => {
    expect(sync).toContain('GDELT_MAX_AVAILABILITY_WAIT_MS: String(FASTLANE_GDELT_WAIT_MS)');
    expect(sync).toContain('initialCombined.includes("CURRENT_GDELT_AVAILABILITY_WAIT_EXHAUSTED")');
    expect(sync).toContain("FASTLANE_PUBLICATION_GDELT_UNAVAILABLE_USING_VERIFIED_LIVE_PRESERVATION");
    expect(sync).toContain('publicationMode = "preserved_verified_live_plus_fresh_scored"');
  });

  it("does not weaken the canonical current-evidence refresh workflow", () => {
    expect(refresh).toContain("run-b2-public-intelligence-publisher.mjs");
    expect(refresh).not.toContain("republish-b2-public-intelligence-preserve-live.mjs");
    expect(refresh).not.toContain("FASTLANE_GDELT_WAIT_MS");
  });

  it("full-readback verifies the existing live package before reusing it", () => {
    expect(preserve).toContain("proof?.full_b2_readback_verified !== true");
    expect(preserve).toContain("proof?.exact_gzip_restore_verified !== true");
    expect(preserve).toContain('String(proof?.compressed_sha256 ?? "") !== sha256(packed)');
    expect(preserve).toContain("Number(proof?.compressed_bytes) !== packed.length");
    expect(preserve).toContain("FASTLANE_PRESERVE_CURRENT_SOURCE_STALE");
    expect(preserve).toContain("LIVE_MAX_AGE_MS = 2 * 60 * 60 * 1000");
  });

  it("preserves source time truth while allowing canonical scored state to advance", () => {
    expect(preserve).toContain('current_source_reused: true');
    expect(preserve).toContain('current_source_freshness_advanced: false');
    expect(preserve).toContain('const CLASSIFICATION_VERSION = "event-severity-v1.0.5"');
    expect(preserve).toContain('.eq("classification_version", CLASSIFICATION_VERSION)');
    expect(preserve).toContain('synthetic_score: false');
  });

  it("keeps public output derived-only and verifies the replacement package", () => {
    expect(preserve).toContain('raw_source_headlines_exposed: false');
    expect(preserve).toContain('provider_identity_exposed: false');
    expect(preserve).toContain('"source_name" in row');
    expect(preserve).toContain('"source_domain" in row');
    expect(preserve).toContain('"source_url" in row');
    expect(preserve).toContain("FASTLANE_PRESERVE_B2_HASH_INVALID");
    expect(preserve).toContain("FASTLANE_PRESERVE_PROOF_READBACK_INVALID");
  });
});
