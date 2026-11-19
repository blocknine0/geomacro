import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS} from "../lib/global-official-release-feeds.mjs";
import {isRetiredPrivateOsintSource} from "../lib/private-osint-retired-sources.mjs";
import {registeredReusableNewsSources} from "../lib/registered-reusable-news-source-collector.mjs";
import {telegramWatchItemsToRadar} from "../ops/append-telegram-speed-radar.mjs";
import {prioritizeApprovedAnchorSources} from "../lib/rights-redacted-speed-radar.mjs";

const json = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

test("critical-minerals publisher discovery covers the major mineral families via official JSON", () => {
  const added = GLOBAL_OFFICIAL_RELEASE_FEEDS.filter((feed) =>
    /^govuk_global_(lithium|cobalt|nickel|copper|graphite|mineral_export_controls|mineral_trade|mineral_customs)$/u.test(feed.id));
  assert.equal(added.length, 8);
  for (const feed of added) {
    assert.equal(feed.category, "rare_earth");
    assert.equal(feed.format, "json");
    assert.equal(feed.host, "www.gov.uk");
    assert.match(feed.url, /^https:\/\/www\.gov\.uk\/api\/search\.json\?/u);
    assert.match(feed.credit, /Open Government Licence v3\.0/u);
  }
  const rareEarth = GLOBAL_OFFICIAL_RELEASE_FEEDS.filter((feed) => feed.category === "rare_earth");
  assert.ok(rareEarth.length >= 15, `expected expanded rare-earth registry, got ${rareEarth.length}`);
  for (const id of ["nrcan_government_news_original_atom_review", "chile_cochilco_minerals", "us_doe_minerals_global", "australia_critical_minerals_minister_global"]) {
    assert.ok(registeredReusableNewsSources().some((source) => source.id === id), `${id} must be polled`);
  }
});

test("live-audit failed local and dead private endpoints are retired without removing source history", () => {
  const retired = json("config/retired-source-replacements.v1.json");
  const retiredById = new Map(retired.retired.map((row) => [row.id, row]));
  for (const [id, state] of [
    ["private_gaplane_eri_supplement", "UNAVAILABLE"],
    ["private_gaplane_kwt_21", "UNAVAILABLE"],
    ["private_mesh_the_reporter_ethiopia", "UNAVAILABLE"],
    ["private_gaplane_gnq_supplement", "MALFORMED"],
    ["private_repo_0c6af81c318e74500bda", "DENIED"],
  ]) {
    assert.equal(retiredById.get(id)?.reason, state, `${id} retirement reason`);
    assert.equal(isRetiredPrivateOsintSource({id}), true);
  }
  const sources = json("config/private-osint-local-gaplane.v1.json").sources;
  for (const id of ["private_gaplane_eri_supplement", "private_gaplane_kwt_21", "private_gaplane_gnq_supplement"]) {
    const source = sources.find((row) => row.id === id);
    assert.ok(source, `${id} remains in historical source registry`);
    assert.equal(isRetiredPrivateOsintSource(source), true);
  }
});

test("Telegram discovery watch coverage spans all Hot 50 cells and three categories", () => {
  const hot50 = json("config/hot-50-three-domain-watch.v1.json").country_iso3;
  const roots = json("config/telegram-discovery-roots.json");
  const matrix = json("config/telegram-global-coverage-matrix.json");
  assert.deepEqual(roots.watch_coverage.country_iso3, hot50);
  assert.deepEqual(matrix.hot50_watch_coverage.country_iso3, hot50);
  assert.deepEqual(matrix.hot50_watch_coverage.categories, ["GEOPOLITICS", "MACRO_FX", "CRITICAL_MINERALS"]);
  for (const category of ["GEOPOLITICS", "MACRO_FX", "CRITICAL_MINERALS"]) {
    assert.ok(roots.watch_coverage.category_watch_taxonomy[category].length >= 6);
    assert.ok(matrix.hot50_watch_coverage.watch_taxonomy[category].length >= 6);
  }
  assert.equal(roots.policy.auto_authorization, false);
  assert.equal(roots.policy.auto_activation, false);
  assert.equal(matrix.runtime_effect, false);
});

test("Telegram watch events emit redacted radar signals and prioritize only approved Lane A anchors", () => {
  const bridge = json("config/telegram-private-signal-bridge.json");
  assert.equal(bridge.redacted_watch_routing.processor, "scripts/lib/rights-redacted-speed-radar.mjs");
  assert.deepEqual(bridge.redacted_watch_routing.required_signal_flags, {
    raw_source_redacted: true,
    licensed_source_text_included: false,
    raw_sources_not_republished: true,
  });
  assert.equal(bridge.redacted_watch_routing.telegram_only_gro_authorized, false);
  const signals = telegramWatchItemsToRadar([{
    country_iso3: "IDN", category: "rare_earth", watch_event: "critical_mineral_supply_shock",
    source_timestamp_claimed_at: "2026-11-18T11:00:00Z", source_content_included: false, raw_article_included: false,
  }], {now: Date.parse("2026-11-18T12:00:00Z")});
  assert.equal(signals.length, 1);
  assert.equal(signals[0].raw_source_redacted, true);
  assert.equal(signals[0].licensed_source_text_included, false);
  assert.equal(signals[0].raw_sources_not_republished, true);
  const prioritized = prioritizeApprovedAnchorSources(signals, [
    {source_id: "idn-lane-a", country_iso3: "IDN", categories: ["CRITICAL_MINERALS"], commercial_rights_approved: 1, enabled: 1},
    {source_id: "idn-unapproved", country_iso3: "IDN", categories: ["CRITICAL_MINERALS"], commercial_rights_approved: 0, enabled: 1},
  ]);
  assert.deepEqual(prioritized.prioritized_source_ids, ["idn-lane-a"]);
  assert.equal(signals[0].signed_gro_authorized, false);
});

test("scheduled Hot 50 and private collectors append Telegram radar before Lane A polling", () => {
  for (const workflowPath of [
    ".github/workflows/hot50-direct-original-news-20m.yml",
    ".github/workflows/private-global-osint-15m.yml",
  ]) {
    const workflow = readFileSync(new URL(`../../${workflowPath}`, import.meta.url), "utf8");
    const append = workflow.indexOf("node scripts/ops/append-telegram-speed-radar.mjs");
    const poll = workflow.indexOf("node scripts/ops/collect-risk-stream-feed-extensions.mjs --collector", append);
    assert.ok(append >= 0 && poll > append, `${workflowPath} must add watch signals before the Lane A poll`);
    assert.ok(workflow.includes('--radar-file "$GEOMACRO_RISK_STREAM_RADAR_FILE"'));
  }
});
