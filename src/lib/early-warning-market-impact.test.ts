import { describe, expect, it } from "vitest";

import {
  MARKET_IMPACT_ASSET_CLASSES,
  MARKET_IMPACT_DRIVERS,
  MARKET_IMPACT_METHOD_VERSION,
  buildMarketImpactAssessment,
  marketRelevanceFromAssessment,
} from "./early-warning-market-impact";

describe("early warning structural market impact", () => {
  it("covers every asset class for every registered driver", () => {
    for (const driver of MARKET_IMPACT_DRIVERS) {
      const result = buildMarketImpactAssessment({
        driver,
        country_iso3: "USA",
        confidence: 0.8,
      });
      expect(result.methodology_version).toBe(MARKET_IMPACT_METHOD_VERSION);
      expect(result.calibrated).toBe(false);
      expect(result.structural_pressure_only).toBe(true);
      expect(result.market_price_prediction).toBe(false);
      expect(result.trading_instruction).toBe(false);
      expect(result.public_performance_claims_allowed).toBe(false);
      expect(Object.keys(result.assets).sort()).toEqual([...MARKET_IMPACT_ASSET_CLASSES].sort());
      expect(result.transmission_channels.length).toBeGreaterThan(0);
    }
  });

  it("maps monetary tightening to higher-yield and risk-asset pressure", () => {
    const result = buildMarketImpactAssessment({
      driver: "MONETARY_TIGHTENING",
      country_iso3: "USA",
      confidence: 0.92,
    });

    expect(result.assets.rates).toMatchObject({
      relevance: "VERY_HIGH",
      pressure_direction: "POSITIVE",
    });
    expect(result.assets.equities.pressure_direction).toBe("NEGATIVE");
    expect(result.assets.crypto.pressure_direction).toBe("NEGATIVE");
    expect(result.assets.fx.pressure_direction).toBe("POSITIVE");
    expect(result.direction_semantics.rates).toBe("sovereign yield pressure");
  });

  it("preserves mixed crypto interpretation during banking stress", () => {
    const result = buildMarketImpactAssessment({
      driver: "BANKING_STRESS",
      country_iso3: "USA",
      confidence: 0.85,
    });

    expect(result.assets.equities).toMatchObject({
      relevance: "VERY_HIGH",
      pressure_direction: "NEGATIVE",
    });
    expect(result.assets.crypto).toMatchObject({
      relevance: "VERY_HIGH",
      pressure_direction: "MIXED",
      rationale_code: "RISK_OFF_VS_BANKING_ALTERNATIVE_CHANNEL",
    });
  });

  it("keeps conflict crypto mixed instead of forcing a trade direction", () => {
    const result = buildMarketImpactAssessment({
      driver: "CONFLICT_ESCALATION",
      country_iso3: "ISR",
      confidence: 0.78,
    });

    expect(result.assets.crypto.pressure_direction).toBe("MIXED");
    expect(result.assets.commodities.pressure_direction).toBe("POSITIVE");
    expect(result.assets.equities.pressure_direction).toBe("NEGATIVE");
  });

  it("marks energy supply disruption as critical commodity relevance", () => {
    const result = buildMarketImpactAssessment({
      driver: "ENERGY_SUPPLY_DISRUPTION",
      country_iso3: "IRN",
      confidence: 0.9,
    });

    expect(result.assets.commodities).toMatchObject({
      relevance: "CRITICAL",
      pressure_direction: "POSITIVE",
    });
    expect(result.assets.fx.pressure_direction).toBe("MIXED");
  });

  it("keeps weak direct crypto transmission uncertain", () => {
    const result = buildMarketImpactAssessment({
      driver: "CRITICAL_MINERAL_DISRUPTION",
      country_iso3: "CHN",
      confidence: 0.75,
    });
    expect(result.assets.crypto).toMatchObject({
      relevance: "LOW",
      pressure_direction: "UNCERTAIN",
    });
  });

  it("derives the legacy relevance map deterministically", () => {
    const result = buildMarketImpactAssessment({
      driver: "SOVEREIGN_STRESS",
      country_iso3: "ARG",
      confidence: 0.88,
    });
    expect(marketRelevanceFromAssessment(result)).toEqual({
      equities: "HIGH",
      crypto: "HIGH",
      fx: "VERY_HIGH",
      rates: "CRITICAL",
      commodities: "MODERATE",
    });
  });

  it("normalizes ISO3 and rejects invalid confidence", () => {
    expect(
      buildMarketImpactAssessment({
        driver: "TRADE_DISRUPTION",
        country_iso3: "ind",
        confidence: 0.7,
      }).country_iso3,
    ).toBe("IND");

    expect(() =>
      buildMarketImpactAssessment({
        driver: "TRADE_DISRUPTION",
        country_iso3: "IND",
        confidence: 1.1,
      }),
    ).toThrow(/confidence must be between 0 and 1/);
  });
});
