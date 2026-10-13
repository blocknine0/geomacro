import { SOURCE_LINEUP, SOURCE_LINEUP_BY_ID, sourceLineupSummary } from "../lib/operator-commercial-free-source-lineup.mjs";
import { FREE_NO_KEY_TRANSPORT_SPECS, validateFreeLineupProbePayload, observeNoKeyLineup, probeNoKeySource } from "../lib/free-no-key-source-probe.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("every operator-listed source is classified, deduped, and locked out of paid activation", () => {
  const ids = SOURCE_LINEUP.map(x => x.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ids.length, 66);
  const s = sourceLineupSummary();
  assert.deepEqual(s.by_category, { geopolitics: 22, macro: 34, rare_earth: 10 });
  assert.equal(s.new_paid_sources_activated, 0);
  assert.ok(SOURCE_LINEUP.every(x => x.production_paid_eligible === false &&
    x.customer_raw_distribution === false && x.requires_per_asset_license_check === true));
  assert.equal(SOURCE_LINEUP_BY_ID.get("nasa_firms").access, "FREE_KEY");
  assert.equal(SOURCE_LINEUP_BY_ID.get("entsoe").access, "FREE_KEY");
  assert.equal(SOURCE_LINEUP_BY_ID.get("eurostat_comext").catalog_rights_status,
    "REVIEW_REQUIRED_NO_COMMERCIAL_ACTIVATION");
  assert.equal(SOURCE_LINEUP_BY_ID.get("world_bank_wdi").canonical_exact_rights_id,
    "world_bank_indicators");
  assert.equal(SOURCE_LINEUP_BY_ID.get("world_bank_pink_sheet").canonical_exact_rights_id, null);
  assert.equal(SOURCE_LINEUP_BY_ID.get("usgs_mcs").canonical_exact_rights_id, "usgs_mcs");
});

test("three no-key rotating probes per group cover all three categories without keys", () => {
  assert.equal(FREE_NO_KEY_TRANSPORT_SPECS.length, 9);
  const counts = new Map();
  for (const s of FREE_NO_KEY_TRANSPORT_SPECS) {
    assert.equal(SOURCE_LINEUP_BY_ID.get(s.id).access, "NO_KEY");
    assert.equal(s.url.startsWith("https://"), true);
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), { geopolitics: 3, macro: 3, rare_earth: 3 });
});

test("format validation is specific: no HTML/XML error as JSON and no annual stats as news", () => {
  const usgs = FREE_NO_KEY_TRANSPORT_SPECS.find(x => x.id === "usgs_earthquakes");
  const bls = FREE_NO_KEY_TRANSPORT_SPECS.find(x => x.id === "bls");
  const bank = FREE_NO_KEY_TRANSPORT_SPECS.find(x => x.id === "world_bank_wdi");
  const minerals = FREE_NO_KEY_TRANSPORT_SPECS.find(x => x.id === "usgs_mcs");
  assert.equal(validateFreeLineupProbePayload(usgs, '{"type":"FeatureCollection","features":[]}').valid, true);
  assert.equal(validateFreeLineupProbePayload(usgs, "<html>access blocked</html>").valid, false);
  assert.equal(validateFreeLineupProbePayload(bls, '{"status":"REQUEST_SUCCEEDED","Results":{"series":[]}}').valid, true);
  assert.equal(validateFreeLineupProbePayload(bank, '[{"page":1},[{"indicator":{"id":"NY.GDP.MKTP.CD"}}]]').valid, true);
  assert.equal(validateFreeLineupProbePayload(bank, '[{"page":1},[{"indicator":{"id":"NOT_WDI"}}]]').valid, false);
  assert.equal(validateFreeLineupProbePayload(minerals, "<!doctype html><html></html>").valid, true);
  assert.equal(validateFreeLineupProbePayload(minerals, "<html>not original data</html>").native_publisher_original_date_verified, false);
});

test("a synthetic three-category probe proves transport only, not rights/events/signing", async () => {
  const network = async url => {
    // Exact URL-origin check: substring tests accept attacker-host suffixes.
    const parsed = new URL(String(url));
    if (parsed.protocol === "https:" && parsed.hostname === "earthquake.usgs.gov")
      return new Response('{"type":"FeatureCollection","features":[]}', { status: 200 });
    if (parsed.protocol === "https:" && parsed.hostname === "api.bls.gov")
      return new Response('{"status":"REQUEST_SUCCEEDED","Results":{"series":[]}}', { status: 200 });
    return new Response("<!doctype html><html></html>", { status: 200 });
  };
  const r = await observeNoKeyLineup(0, network);
  assert.equal(r.attempted, 3);
  assert.deepEqual(Object.keys(r.per_category), ["geopolitics","macro","rare_earth"]);
  assert.ok(Object.values(r.per_category).every(x => x.checked === 1 && x.readable === 1));
  assert.equal(r.payments, 0);
  assert.equal(r.raw_payload_persisted, false);
  assert.equal(r.scored_or_signed_intelligence_delivered, false);
  assert.equal(r.dataset_license_newly_verified, false);
});

test("bounded CISA JSON is parseable, while HEAD-only, rate limits and blocks prove nothing", async () => {
  const spec = FREE_NO_KEY_TRANSPORT_SPECS.find(x => x.id === "cisa_kev");
  const cisa = await probeNoKeySource(spec, async () =>
    new Response('{"catalogVersion":"2026.10","vulnerabilities":[]}', {status: 200}));
  assert.equal(cisa.state, "TRANSPORT_READABLE");
  assert.equal(cisa.content_format_proven, true);
  assert.equal(cisa.original_publisher_release_proven, false);
  const head = await probeNoKeySource({...spec, format: "head"}, async () =>
    new Response(null, {status: 200}));
  assert.equal(head.state, "ENDPOINT_REACHABLE_FORMAT_UNVERIFIED");
  assert.equal(head.content_format_proven, false);
  const malformed = await probeNoKeySource(spec, async () =>
    new Response("<html>blocked</html>", { status: 200 }));
  assert.equal(malformed.state, "FORMAT_OR_SIZE_UNVERIFIED");
  const blocked = await probeNoKeySource(spec, async () => new Response(null, {status: 429}));
  assert.equal(blocked.state, "DENIED_OR_RATE_LIMIT");
  assert.equal(blocked.commercial_paid_activation, false);
  const timeout = await probeNoKeySource(spec, async () => { throw new Error("network down"); });
  assert.equal(timeout.state, "NETWORK_UNAVAILABLE");
});
