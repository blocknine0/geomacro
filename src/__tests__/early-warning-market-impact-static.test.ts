import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/939_early_warning_market_impact.sql",
  "utf8",
);
const service = fs.readFileSync("src/lib/early-warning-service.server.ts", "utf8");
const impact = fs.readFileSync("src/lib/early-warning-market-impact.ts", "utf8");

describe("early warning market impact static contract", () => {
  it("persists a separately versioned hash-bound market impact object", () => {
    for (const token of [
      "market_impact jsonb",
      "market_impact_methodology_version text",
      "market_impact_calibrated boolean not null default false",
      "market_impact_hash text",
      "early-warning-market-impact-v0.1-provisional",
      "market_impact_hash ~ '^[0-9a-f]{64}$'",
    ]) {
      expect(migration).toContain(token);
    }
  });

  it("keeps market impact immutable after publication", () => {
    for (const token of [
      "new.market_impact is distinct from old.market_impact",
      "new.market_impact_methodology_version is distinct from old.market_impact_methodology_version",
      "new.market_impact_calibrated is distinct from old.market_impact_calibrated",
      "new.market_impact_hash is distinct from old.market_impact_hash",
    ]) {
      expect(migration).toContain(token);
    }
  });

  it("keeps v0.1 explicitly uncalibrated and non-trading", () => {
    expect(impact).toContain('calibrated: false');
    expect(impact).toContain('structural_pressure_only: true');
    expect(impact).toContain('market_price_prediction: false');
    expect(impact).toContain('trading_instruction: false');
    expect(impact).toContain('public_performance_claims_allowed: false');
    expect(impact).not.toMatch(/\bBUY\b|\bSELL\b|price_target|target_price/i);
  });

  it("derives legacy channels and relevance from the deterministic driver", () => {
    expect(service).toContain("buildMarketImpactAssessment");
    expect(service).toContain("marketRelevanceFromAssessment");
    expect(service).toContain("market_impact_driver cannot be combined");
    expect(service).toContain("market_impact_hash: marketImpactHash");
    expect(service).toContain("existing.data.market_impact_hash !== record.market_impact_hash");
  });
});
