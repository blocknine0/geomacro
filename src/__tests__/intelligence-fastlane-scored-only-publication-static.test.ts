import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sync = readFileSync("scripts/ops/sync-fastlane-scored-intelligence.mjs", "utf8");
const scoredOnly = readFileSync("scripts/ops/republish-b2-public-intelligence-scored-only.mjs", "utf8");

describe("#1414 scored-only B2 publication fallback", () => {
  it("uses scored-only publication only for an unavailable/stale live layer", () => {
    expect(sync).toContain('scripts/ops/republish-b2-public-intelligence-scored-only.mjs');
    expect(sync).toContain('before?.mode === "verified_b2"');
    expect(sync).toContain("before.live_observed_rows === 0");
    expect(sync).toContain("FASTLANE_PRESERVE_CURRENT_SOURCE_STALE");
    expect(sync).toContain("FASTLANE_PUBLICATION_PRESERVE_LIVE_FAILED");
    expect(sync).toContain('publicationMode = "fresh_scored_only_no_current_live_export"');
  });

  it("requires current canonical classifier scores across all three launch domains", () => {
    expect(scoredOnly).toContain('const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"]');
    expect(scoredOnly).toContain('const CLASSIFICATION_VERSION = "event-severity-v1.0.5"');
    expect(scoredOnly).toContain("const REQUIRED_FRESH_MS = 24 * 60 * 60 * 1000");
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_CATEGORY_STALE");
    expect(scoredOnly).toContain("current_scored_latest_at: latestByCategory");
  });

  it("never promotes a raw live feature or stale live row into the scored-only package", () => {
    expect(scoredOnly).toContain('public_status: "verified_b2"');
    expect(scoredOnly).toContain('scoring_policy: "canonical-current-scored-only"');
    expect(scoredOnly).toContain("live_observed_rows: 0");
    expect(scoredOnly).toContain("scored_only: true");
    expect(scoredOnly).toContain("synthetic_score: false");
    expect(scoredOnly).toContain("current_source_id: null");
    expect(scoredOnly).toContain("current_source_batch_at: null");
  });

  it("preserves bounded cross-source and cross-batch near-duplicate suppression", () => {
    expect(scoredOnly).toContain("const DUPLICATE_WINDOW_MS = 72 * 60 * 60 * 1000");
    expect(scoredOnly).toContain("function sameStory(a, b)");
    expect(scoredOnly).toContain("summaryOverlap.jaccard >= 0.82");
    expect(scoredOnly).toContain("summaryOverlap.containment >= 0.74");
    expect(scoredOnly).toContain("titleOverlap.jaccard >= 0.82");
    expect(scoredOnly).toContain("dedupeScoredRows(grouped.get(category))");
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_NEAR_DUPLICATE_ROW");
    expect(scoredOnly).toContain("near_duplicate_suppression: true");
  });

  it("keeps public rows derived-only, deduplicated and provider-private", () => {
    expect(scoredOnly).toContain('`Geomacro finds ${narrative');
    expect(scoredOnly).toContain('"source_name" in row');
    expect(scoredOnly).toContain('"source_domain" in row');
    expect(scoredOnly).toContain('"source_url" in row');
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_DUPLICATE_ROW");
    expect(scoredOnly).toContain("raw_source_headlines_exposed: false");
    expect(scoredOnly).toContain("provider_identity_exposed: false");
  });

  it("accepts the B2 package only after hash, restore and proof readback verification", () => {
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_B2_HASH_INVALID");
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_B2_RESTORE_INVALID");
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_B2_BINDING_INVALID");
    expect(scoredOnly).toContain("FASTLANE_SCORED_ONLY_PROOF_READBACK_INVALID");
    expect(scoredOnly).toContain("full_b2_readback_verified: true");
    expect(scoredOnly).toContain("exact_gzip_restore_verified: true");
  });
});
