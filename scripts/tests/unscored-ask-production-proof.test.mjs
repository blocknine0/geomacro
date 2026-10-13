import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectPublishedBuild, inspectUnscoredAsk } from "../lib/unscored-ask-production-proof.mjs";

const NOW = Date.parse("2026-10-13T14:00:00Z");
const SHA = "452f1f5c84a202e5768e071c98c899c9de6a837f";

function observed() {
  return {
    ok: true,
    data: {
      intelligence_tier: "official_observation_unscored",
      summary: "Geomacro observed a recent official release in Macro/FX; unscored observation.",
      what_changed: "An official publisher issued an economic update.",
      why_it_matters: "The original release informs recent macroeconomic context.",
      geomacro_view: "No independent verification, score or signed GRO is claimed.",
      evidence: [{ eventId: "live:official:macro-0a12bc34",
        title: "Geomacro finds monetary policy on central banks", relevance: 100 }],
      latest_original_published_at: "2026-10-13T12:00:00Z",
      insufficient_evidence: false, low_confidence: true,
      gri: null, mean_relevance: null, signed_gro_generated: false,
      independent_same_event_verification: false,
      source_identity_exposed: false, durable_live_storage_write: false,
      data_mode: "ephemeral_live",
    },
  };
}

test("deployed exact SHA is mandatory", () => {
  assert.equal(inspectPublishedBuild({ canonical_main_sha: SHA }, SHA).ok, true);
  assert.equal(inspectPublishedBuild({ canonical_main_sha: "a".repeat(40) }, SHA).ok, false);
  assert.equal(inspectPublishedBuild({}, SHA).ok, false);
});

test("original-published news is accepted only as unsigned publisher observation", () => {
  const proof = inspectUnscoredAsk(observed(), "macro", NOW);
  assert.equal(proof.ok, true);
  assert.equal(proof.risk_signing_not_claimed, true);
  assert.equal(proof.source_private, true);
});

test("stale original clocks, no evidence, payment/signed claims and raw URLs fail", () => {
  const old = observed();
  old.data.latest_original_published_at = "2026-10-09T10:00:00Z";
  assert.equal(inspectUnscoredAsk(old, "macro", NOW).ok, false);
  const embargo = observed();
  embargo.data.latest_original_published_at = "2026-10-13T13:59:00Z";
  assert.equal(inspectUnscoredAsk(embargo, "macro", NOW).ok, false);
  const signed = observed();
  signed.data.signed_gro_generated = true;
  assert.equal(inspectUnscoredAsk(signed, "macro", NOW).ok, false);
  const noEvidence = observed();
  noEvidence.data.evidence = [];
  assert.equal(inspectUnscoredAsk(noEvidence, "macro", NOW).ok, false);
  const leak = observed();
  leak.data.geomacro_view += " https://example.invalid";
  assert.equal(inspectUnscoredAsk(leak, "macro", NOW).ok, false);
  const scored = observed();
  scored.data.gri = 90;
  assert.equal(inspectUnscoredAsk(scored, "macro", NOW).ok, false);
});

test("missing release is never silently counted as success", () => {
  const fallback = observed();
  fallback.data.intelligence_tier = undefined;
  fallback.data.insufficient_evidence = true;
  const proof = inspectUnscoredAsk(fallback, "critical_minerals", NOW);
  assert.equal(proof.ok, false);
  assert.equal(proof.status, "NO_CURRENT_UNSCORED_OFFICIAL_RELEASE");
  assert.equal(inspectUnscoredAsk(null, "geopolitics", NOW).ok, false);
});
