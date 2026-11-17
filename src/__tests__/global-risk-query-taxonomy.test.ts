import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GLOBAL_RISK_QUERY_BUCKETS,
  GLOBAL_RISK_QUERY_CATEGORIES,
  GLOBAL_RISK_QUERY_ROTATION_MS,
  buildCountrySourceDiscoveryQueries,
  selectGlobalRiskQueryBucket,
} from "../../scripts/lib/global-risk-query-taxonomy.mjs";
import { buildRealtimeSearchPlan } from "@/lib/ask-realtime-query-plan";
import { planSafeRealtimeIndexQueries } from "@/lib/ask-realtime-search.server";
import { riskPublisherSearchPlan } from "../../workers/control-plane/src/risk-gate-global-news-search.mjs";
import { deriveRiskStreamEligibleScore } from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import { p0bHeadlineEvent } from "../../scripts/lib/p0b-event-grounded-projection.mjs";

const START = Date.parse("2026-11-18T00:00:00.000Z");

describe("rotating global risk search taxonomy", () => {
  it("covers the requested high-signal topics across all three categories", () => {
    const corpus = Object.fromEntries(Object.entries(GLOBAL_RISK_QUERY_BUCKETS)
      .map(([category, buckets]) => [category, buckets.flatMap(bucket => bucket.terms)
        .join(" | ").toLowerCase()]));
    const coverage: Record<string, string[]> = {
      GEOPOLITICS: [
        "armed conflict", "border mobilization", "naval blockade", "red sea",
        "bab el-mandeb", "strait of hormuz", "malacca strait", "suez canal",
        "panama canal", "black sea", "taiwan strait", "subsea cable sabotage",
        "pipeline sabotage", "power grid sabotage", "secondary sanctions",
        "dual-use export controls", "semiconductor export ban", "arms export ban",
        "coup attempt", "martial law", "regime instability", "port strike",
        "rail strike", "airspace closure", "shipping closure",
      ],
      MACRO_FX: [
        "emergency rate hike", "emergency rate cut", "quantitative tightening",
        "quantitative easing", "fx intervention", "currency devaluation",
        "currency peg", "capital controls", "repatriation freeze",
        "sovereign debt default", "debt restructuring", "imf bailout",
        "sovereign yield spike", "credit downgrade", "cpi surprise",
        "pmi contraction", "gdp shock", "tariff increase", "customs retaliation",
        "bank liquidity stress", "swift restriction", "payment rail disruption",
        "oil supply price shock", "lng supply disruption", "grain price shock",
        "open market operation repo liquidity", "reverse repo standing facility",
        "CET1 tier 1 capital ratio", "LCR NSFR bank liquidity stress",
        "SOFR EURIBOR TONAR interbank rates", "cross currency basis swap stress",
        "2Y 10Y 30Y sovereign yield curve", "2s10s curve term premium shift",
        "sovereign bond auction bid to cover tail", "PPI PCE inflation breakeven surprise",
        "VIX MOVE FX implied volatility risk reversal", "FPI FII cross border capital outflow",
        "stablecoin liquidity redemption flow",
      ],
      CRITICAL_MINERALS: [
        "lithium", "cobalt", "nickel", "copper", "rare earths", "ndpr",
        "dysprosium", "terbium", "graphite", "gallium", "germanium",
        "antimony", "tungsten", "manganese", "vanadium", "titanium", "uranium",
        "potash", "phosphate", "mineral export ban", "mining royalty hike",
        "mine nationalization", "mine strike", "smelter outage",
        "strategic mineral stockpiling", "battery mineral processing",
        "semiconductor mineral processing", "LME COMEX CME SHFE INE exchange warehouse inventory",
        "cancelled warrants exchange warehouse draw", "copper backwardation contango curve spread",
        "treatment charge refining charge TC RC", "polysilicon gold silver PGM benchmark prices",
        "critical mineral offtake deal supply finance",
      ],
    };
    for (const [category, expected] of Object.entries(coverage)) {
      for (const phrase of expected) expect(corpus[category]).toContain(phrase);
    }
  });

  it("keeps exactly three categories and builds bounded country institution search templates", () => {
    expect(GLOBAL_RISK_QUERY_CATEGORIES).toEqual([
      "GEOPOLITICS", "MACRO_FX", "CRITICAL_MINERALS",
    ]);
    const pack = buildCountrySourceDiscoveryQueries("United States", "MACRO_FX");
    expect(pack.category).toBe("MACRO_FX");
    expect(pack.queries.map(query => query.lane)).toEqual([
      "central_bank", "national_exchange", "banking_regulator", "market_news",
    ]);
    expect(pack.queries.map(query => query.query)).toEqual(
      buildCountrySourceDiscoveryQueries("United States", "MACRO_FX").queries.map(query => query.query),
    );
    expect(pack.queries.every(query => query.query.length <= 240)).toBe(true);
    expect(pack.queries[0].query).toContain("central bank");
    expect(pack.queries[1].query).toContain("national stock exchange");
    expect(pack.queries[2].query).toContain("banking regulator");
    expect(pack.queries[3].affected_assets).toContain("capital_flows");
    expect(() => buildCountrySourceDiscoveryQueries("Country", "CRYPTO")).toThrow(
      "GLOBAL_RISK_QUERY_COUNTRY_INPUT_INVALID",
    );
  });

  it("rotates every topic bucket on fixed 20-minute slots with bounded metadata", () => {
    expect(GLOBAL_RISK_QUERY_ROTATION_MS).toBe(20 * 60_000);
    for (const category of Object.keys(GLOBAL_RISK_QUERY_BUCKETS) as Array<keyof typeof GLOBAL_RISK_QUERY_BUCKETS>) {
      const seen = new Set(Array.from({ length: GLOBAL_RISK_QUERY_BUCKETS[category].length }, (_, slot) =>
        selectGlobalRiskQueryBucket(category, START + slot * GLOBAL_RISK_QUERY_ROTATION_MS).bucket_id));
      expect(seen.size).toBe(GLOBAL_RISK_QUERY_BUCKETS[category].length);
      const bucket = selectGlobalRiskQueryBucket(category, START, 149);
      expect(bucket.terms.length).toBeLessThanOrEqual(8);
      expect(bucket.topic_tags.length).toBeLessThanOrEqual(8);
      expect(bucket.affected_assets.length).toBeLessThanOrEqual(8);
    }
  });

  it("keeps Risk Stream and Ask to their existing bounded provider calls", () => {
    const first = riskPublisherSearchPlan({ name: "India", category: "CRITICAL_MINERALS" }, START, 17);
    const next = riskPublisherSearchPlan({ name: "India", category: "CRITICAL_MINERALS" },
      START + GLOBAL_RISK_QUERY_ROTATION_MS, 17);
    expect(first.topic_bucket_id).not.toBe(next.topic_bucket_id);
    expect(first.url.length).toBeLessThan(1200);
    expect(first.affected_assets.length).toBeLessThanOrEqual(8);

    const plan = buildRealtimeSearchPlan("What changed today?", START);
    expect(plan.broadCategories).toEqual(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
    expect(plan.topicBuckets).toHaveLength(3);
    const ask = planSafeRealtimeIndexQueries("What changed today in India?", START);
    expect(ask.queries).toHaveLength(3);
    expect(ask.queries.map(query => query.category)).toEqual([
      "GEOPOLITICS", "MACRO", "CRITICAL_MINERALS",
    ]);
    expect(ask.queries.every(query => query.query.length <= 900)).toBe(true);
    const askNext = planSafeRealtimeIndexQueries("What changed today in India?",
      START + GLOBAL_RISK_QUERY_ROTATION_MS);
    expect(askNext.queries.map(query => query.topic_bucket_id))
      .not.toEqual(ask.queries.map(query => query.topic_bucket_id));
  });

  it("persists topic tags only as bounded search metadata while lead rights stay disabled", () => {
    const migration = readFileSync(
      "workers/control-plane/migrations/0224_risk_stream_search_topic_tags.sql", "utf8",
    );
    const writer = readFileSync("workers/control-plane/src/risk-stream-autonomous-hot50.mjs", "utf8");
    expect(migration).toContain("topic_bucket_id TEXT NOT NULL DEFAULT 'legacy'");
    expect(migration).toContain("topic_tags_json TEXT NOT NULL DEFAULT '[]'");
    expect(migration).toContain("affected_assets_json TEXT NOT NULL DEFAULT '[]'");
    expect(writer).toContain("if(leads.length===7)break");
    expect(writer).toContain("if(bindings.length>90)fail(\"D1_PARAMETER_CAP\")");
    expect(writer).toContain("x.topic_bucket_id,JSON.stringify(x.topic_tags)");
    expect(writer).toContain("JSON.stringify(x.affected_assets)");
    expect(writer).toContain("affected_assets_json");
    expect(writer).toContain("commercial_rights_verified:false");
    expect(writer).toContain("originals_verified:0,independent_same_event_verified:false");
  });

  it("projects bank, financial-warfare, and physical-market titles without inventing prices", () => {
    const bank = p0bHeadlineEvent(
      "Central bank reports repo liquidity operation and reserve update", "macro",
    );
    expect(bank?.what).toContain("reported");
    expect(bank?.why).toContain("financing and currency expectations");

    const geopolitics = p0bHeadlineEvent(
      "Treasury announces correspondent banking restrictions for selected entities",
      "geopolitics",
    );
    expect(geopolitics?.why).toContain("settlement access");
    expect(geopolitics?.why).toContain("remain separate questions");

    const minerals = p0bHeadlineEvent(
      "LME reports cancelled warrants and copper warehouse inventory draw",
      "rare_earth",
    );
    expect(minerals?.why).toContain("mineral-supply");
    expect(minerals?.why).not.toContain("price move occurred");
  });

  it("maps bank, equity, and exchange market signals into their existing categories", () => {
    const bank = deriveRiskStreamEligibleScore("MACRO_FX", "IND",
      "CET1 LCR NSFR bank deposit flight and stress test");
    expect(bank?.event_class).toBe("BANK_CAPITAL_LIQUIDITY_STRESS");
    expect(bank?.agent_decision.affected_assets).toContain("bank_capital");
    expect(bank?.agent_decision.affected_assets).toContain("bank_liquidity");

    const equity = deriveRiskStreamEligibleScore("MACRO_FX", "IND",
      "NIFTY benchmark stock exchange circuit breaker VIX volatility");
    expect(equity?.event_class).toBe("EQUITY_MARKET_MICROSTRUCTURE");
    expect(equity?.agent_decision.affected_assets).toContain("equity_indices");
    expect(equity?.agent_decision.affected_assets).toContain("equity_volatility");

    const inventory = deriveRiskStreamEligibleScore("CRITICAL_MINERALS", "CHL",
      "LME exchange warehouse inventory and cancelled warrants copper");
    expect(inventory?.event_class).toBe("EXCHANGE_INVENTORY_SHOCK");
    expect(inventory?.agent_decision.affected_assets).toContain("exchange_inventories");
    expect(inventory?.agent_decision.affected_assets).toContain("warehouse_stocks");
  });

  it("maps new event vocabulary into bounded derived affected assets", () => {
    const geo = deriveRiskStreamEligibleScore("GEOPOLITICS", "IND",
      "subsea cable sabotage disrupts the Strait of Hormuz");
    expect(geo?.agent_decision.affected_assets).toContain("subsea_cables");
    expect(geo?.agent_decision.affected_assets).toContain("brent_crude");

    const minerals = deriveRiskStreamEligibleScore("CRITICAL_MINERALS", "CHL",
      "mine strike and smelter outage disrupt dysprosium and graphite output");
    expect(minerals?.agent_decision.affected_assets).toContain("dysprosium");
    expect(minerals?.agent_decision.affected_assets).toContain("graphite");
    expect(minerals?.agent_decision.affected_assets.length).toBeLessThanOrEqual(24);
  });
});
