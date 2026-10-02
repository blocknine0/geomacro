import assert from "node:assert/strict";
import test from "node:test";

import {answerQuestion} from "./intelligence-engine.mjs";

function assertPublicFindings(answer) {
  const publicFields = [
    "category", "country_iso3", "published_at", "observed_at", "title",
    "summary", "metric", "value_numeric", "value_text", "unit",
    "event_type", "signal_type", "confidence"
  ].sort();
  const findings = answer.findings.flatMap(group => group.findings);
  assert.ok(findings.length > 0, "privacy checks must inspect actual findings");
  for (const finding of findings) {
    assert.deepEqual(Object.keys(finding).sort(), publicFields);
  }
}

function verifiedAdapters(counter) {
  return {
    GEOPOLITICS: async () => {
      counter.calls += 1;
      return [
        {
          source_id: "private_source_a",
          source_url: "https://example.com/a",
          source_name: "private_source_name_a",
          source_domain: "example.com",
          raw: {secret: true},
          category: "GEOPOLITICS",
          country_iso3: "IND",
          published_at: "2026-09-28T00:00:00Z",
          title: "Shipping disruption increased near a major route",
          summary: "Shipping disruption increased near a major route",
          confidence: 0.8
        },
        {
          source_id: "private_source_b",
          source_url: "https://example.org/b",
          source_name: "private_source_name_b",
          source_domain: "example.org",
          raw: {secret: true},
          category: "GEOPOLITICS",
          country_iso3: "IND",
          published_at: "2026-09-28T00:01:00Z",
          title: "Shipping disruption increased near a major route",
          summary: "Shipping disruption increased near a major route",
          confidence: 0.9
        }
      ];
    }
  };
}

test("live mode strips sources and never reports a durable live write", async () => {
  const counter = {calls: 0};
  const result = await answerQuestion("current shipping security risk", {
    countryIso3: "IND",
    adapters: verifiedAdapters(counter),
    options: {cacheTtlMs: 0}
  });

  assert.equal(result.data_mode, "ephemeral_live");
  assert.equal(result.source_identity_exposed, false);
  assert.equal(result.durable_live_storage_write, false);
  assert.equal(result.insufficient_evidence, false);
  assert.match(result.message, /Geomacro found these factors in real time/i);
  assert.equal(counter.calls, 1);

  assertPublicFindings(result);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private_source_a"), false);
  assert.equal(serialized.includes("private_source_name_a"), false);
  assert.equal(serialized.includes("secret"), false);
});

test("sanitized answer is served from process-memory short cache", async () => {
  const counter = {calls: 0};
  const adapters = verifiedAdapters(counter);
  const question = `shipping security cache test ${Date.now()}`;

  const first = await answerQuestion(question, {
    countryIso3: "IND",
    adapters,
    options: {cacheTtlMs: 60_000}
  });
  const second = await answerQuestion(question, {
    countryIso3: "IND",
    adapters,
    options: {cacheTtlMs: 60_000}
  });

  assert.equal(first.data_mode, "ephemeral_live");
  assert.equal(second.data_mode, "short_cache");
  assert.equal(second.cache_status, "hit");
  assert.equal(counter.calls, 1);
  assertPublicFindings(first);
  assertPublicFindings(second);
});

test("forceLive skips permanent data but still reuses the short cache", async () => {
  const counter = {calls: 0};
  const adapters = verifiedAdapters(counter);
  const question = `latest shipping security cache test ${Date.now()}`;
  let permanentReads = 0;
  const permanentReader = async () => {
    permanentReads += 1;
    return {sufficient: true, data: {should_not_be_used: true}};
  };

  const first = await answerQuestion(question, {
    countryIso3: "IND",
    adapters,
    permanentReader,
    options: {cacheTtlMs: 60_000, forceLive: true}
  });
  const second = await answerQuestion(question, {
    countryIso3: "IND",
    adapters,
    permanentReader,
    options: {cacheTtlMs: 60_000, forceLive: true}
  });

  assert.equal(first.data_mode, "ephemeral_live");
  assert.equal(second.data_mode, "short_cache");
  assert.equal(counter.calls, 1);
  assert.equal(permanentReads, 0);
});

test("permanent reader wins when it reports sufficient fresh internal data", async () => {
  const counter = {calls: 0};
  const result = await answerQuestion("shipping security permanent test", {
    countryIso3: "IND",
    adapters: verifiedAdapters(counter),
    permanentReader: async () => ({
      sufficient: true,
      data: {risk_level: "elevated", finding_count: 2}
    })
  });

  assert.equal(result.data_mode, "permanent");
  assert.equal(result.source_identity_exposed, false);
  assert.equal(result.durable_live_storage_write, false);
  assert.equal(counter.calls, 0);
});

test("permanent store failure falls through to independent live adapters", async () => {
  const counter = {calls: 0};
  const result = await answerQuestion(`shipping security outage test ${Date.now()}`, {
    countryIso3: "IND",
    adapters: verifiedAdapters(counter),
    permanentReader: async () => {
      throw new Error("simulated permanent-store outage");
    },
    options: {cacheTtlMs: 0}
  });

  assert.equal(result.data_mode, "ephemeral_live");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.source_identity_exposed, false);
  assert.equal(result.durable_live_storage_write, false);
  assert.equal(result.insufficient_evidence, false);
  assert.equal(counter.calls, 1);
});

test("one failed live adapter does not crash the entire Ask request", async () => {
  const result = await answerQuestion(`shipping macro adapter partial outage ${Date.now()}`, {
    countryIso3: "IND",
    adapters: {
      GEOPOLITICS: async () => {
        throw new Error("upstream unavailable: private detail");
      },
      MACRO: async () => []
    },
    options: {cacheTtlMs: 0}
  });

  assert.equal(result.data_mode, "ephemeral_live");
  assert.equal(result.cache_status, "miss");
  assert.equal(result.source_identity_exposed, false);
  assert.equal(result.durable_live_storage_write, false);
  assert.equal(result.insufficient_evidence, true);
  assert.equal(result.adapter_results.GEOPOLITICS.unavailable, true);
  assert.equal(result.adapter_results.MACRO.unavailable, false);
  assert.equal(JSON.stringify(result).includes("private detail"), false);
});
