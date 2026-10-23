import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectPublishedBuild, inspectUnscoredAsk, inspectBoundedFollowUp } from "../lib/unscored-ask-production-proof.mjs";

import { verifyAskAcceptance } from "../ops/verify-unscored-ask-production.mjs";

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
  embargo.data.latest_original_published_at = "2026-10-13T14:00:01Z";
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

function followUp() {
  return { ...observed(), context: { mode: "bounded_follow_up",
    resolved_question: "What is the current geopolitical risk in India?" } };
}

test("follow-up checks exact context without claiming evidence acceptance", () => {
  const body = followUp();
  body.data.insufficient_evidence = true;
  const proof = inspectBoundedFollowUp(body);
  assert.equal(proof.ok, true);
  assert.equal(proof.evidence_acceptance_claimed, false);
  for (const mutate of [
    b => { b.ok = false; },
    b => { b.context.mode = "grounded_ask"; },
    b => { b.context.resolved_question = "What is the current geopolitical risk in China?"; },
    b => { b.data.source_identity_exposed = true; },
    b => { delete b.data.source_identity_exposed; },
    b => { b.data.summary += " https://example.invalid/private"; },
    b => { b.data.raw_payload = "private"; },
    b => { b.data = null; },
  ]) {
    const bad = followUp(); mutate(bad);
    assert.equal(inspectBoundedFollowUp(bad).ok, false);
  }
  assert.equal(inspectBoundedFollowUp(null).ok, false);
});

function mockReadback({ sha = SHA, follow = followUp(), category = observed(), http = 200 } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("geomacro-build.json"))
      return Response.json({ canonical_main_sha: sha });
    const isFollowUp = !!init.headers["x-geomacro-previous-question"];
    return Response.json(isFollowUp ? follow : category, { status: http });
  } };
}

test("stale deployment blocks all Ask reads; GET-only exact head checks all categories and context", async () => {
  const stale = mockReadback({ sha: "a".repeat(40) });
  assert.equal((await verifyAskAcceptance({ ...stale, expectedSha: SHA, now: NOW })).ok, false);
  assert.equal(stale.calls.length, 1);
  const good = mockReadback();
  const proof = await verifyAskAcceptance({ ...good, expectedSha: SHA, now: NOW });
  assert.equal(proof.ok, true);
  assert.equal(good.calls.length, 5);
  assert.equal(proof.categories.length, 3);
  assert.equal(proof.follow_up.evidence_acceptance_claimed, false);
  for (const { init } of good.calls) {
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.body, undefined);
    assert.equal(Object.keys(init.headers).some(key => /payment|authorization/i.test(key)), false);
  }
  assert.equal(good.calls[4].init.headers["x-geomacro-previous-question"], "What is driving geopolitical risk?");
  assert.equal(good.calls[4].init.headers["x-geomacro-question"], "What about India?");
  assert.equal(JSON.stringify(proof).includes("Geomacro finds"), false);
});

test("correct context cannot rescue missing current evidence, HTTP failures or bad follow-up", async () => {
  const missing = observed(); missing.data.insufficient_evidence = true;
  for (const options of [
    { category: missing },
    { http: 503 },
    { follow: { ...followUp(), context: { mode: "grounded_ask" } } },
  ]) {
    const readback = mockReadback(options);
    const proof = await verifyAskAcceptance({ ...readback, expectedSha: SHA, now: NOW });
    assert.equal(proof.ok, false);
    assert.equal(proof.production_verification, "CATEGORY_OR_FOLLOW_UP_NOT_PROVEN");
  }
  const unavailable = mockReadback();
  const baseFetch = unavailable.fetchImpl;
  unavailable.fetchImpl = (url, init) => {
    if (init.headers["x-geomacro-previous-question"]) throw Error("private transport details");
    return baseFetch(url, init);
  };
  const proof = await verifyAskAcceptance({ ...unavailable, expectedSha: SHA, now: NOW });
  assert.equal(proof.ok, false);
  assert.equal(proof.follow_up.status, "FOLLOW_UP_TRANSPORT_UNAVAILABLE");
  assert.equal(JSON.stringify(proof).includes("private transport details"), false);
});
