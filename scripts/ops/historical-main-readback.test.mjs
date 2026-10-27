import assert from "node:assert/strict";
import test from "node:test";
import {
  HISTORICAL_CANARY_TARGETS,
  probeMainHistoricalServing,
  resolveHistoricalUrl,
} from "./historical-main-readback.mjs";

const historicalUrl = "https://nqvpcbnnvjsrlvyxxevk.supabase.co";

test("historical Supabase cannot silently become main Supabase or arbitrary host", () => {
  assert.equal(resolveHistoricalUrl(historicalUrl + "/"), historicalUrl);
  for (const bad of [
    "https://ldpwajisioljyjtojvfx.supabase.co",
    "https://unknown.supabase.co",
    "http://nqvpcbnnvjsrlvyxxevk.supabase.co",
    historicalUrl + ".evil.test",
    historicalUrl + "/raw",
    historicalUrl + "?key=abc",
  ]) assert.throws(() => resolveHistoricalUrl(bad));
});

test("three tiny GETs, country-bound geopolitics, no credentials or rows returned", async () => {
  const calls = [];
  const mock = async (url, options) => {
    calls.push({ url: String(url), options });
    const column = url.searchParams.get("select");
    return new Response(JSON.stringify([
      { [column]: column === "country_iso3" ? "USA" : 2024 },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await probeMainHistoricalServing({
    url: historicalUrl, serviceKey: "fixture123", fetcher: mock,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.requests_attempted_max, 3);
  assert.equal(result.main_d1_queries, 0);
  assert.equal(result.b2_operations, 0);
  assert.equal(result.writes, 0);
  assert.equal(calls.length, HISTORICAL_CANARY_TARGETS.length);
  assert.match(calls[0].url, /country_iso3=eq.USA/);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  for (const item of calls) {
    assert.match(item.url, /limit=1/);
    assert.doesNotMatch(item.url, /order=/);
    assert.doesNotMatch(item.url, /count=/);
    assert.doesNotMatch(item.url, /\*/);
  }
  assert.doesNotMatch(JSON.stringify(result), /fixture123|USA/);
});

test("empty or 500 serving interface fails closed, no synthetic zero", async () => {
  const responses = [
    new Response("[]", { status: 200 }),
    new Response("server error", { status: 500 }),
    new Response("[{}]", { status: 200 }),
  ];
  const result = await probeMainHistoricalServing({
    url: historicalUrl, serviceKey: "fixture123", fetcher: async () => responses.shift(),
  });
  assert.equal(result.status, "UNREADY");
  assert.equal(result.domains.geopolitics.status, "EMPTY");
  assert.equal(result.domains.macroeconomics.reason, "http_500");
  assert.equal(result.domains.critical_minerals.reason, "readback_failed");
});

test("oversized responses fail closed and credentials never reach a wrong Supabase", async () => {
  let calls = 0;
  const mock = async () => {
    calls += 1;
    return new Response(JSON.stringify([{ country_iso3: "A".repeat(9000) }]), { status: 200 });
  };
  await assert.rejects(probeMainHistoricalServing({
    url: "https://ldpwajisioljyjtojvfx.supabase.co",
    serviceKey: "fixture123", fetcher: mock,
  }));
  assert.equal(calls, 0);
  const result = await probeMainHistoricalServing({
    url: historicalUrl, serviceKey: "fixture123", fetcher: mock,
  });
  assert.equal(result.status, "UNREADY");
  assert.equal(result.domains.geopolitics.status, "ERROR");
  assert.equal(calls, 3);
});
