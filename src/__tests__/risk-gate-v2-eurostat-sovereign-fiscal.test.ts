import { describe, expect, it } from "vitest";

import { buildMacroNormalizationSnapshot } from "../lib/country-risk-v02-normalization";
import { isExpectedSparseWdiDebtCoverageError } from "../lib/country-risk-v02-macro.server";
import {
  buildRiskGateV2EurostatSovereignFiscalModuleState,
  EUROSTAT_SOVEREIGN_FISCAL_METRIC,
  RISK_GATE_V2_EUROSTAT_SOVEREIGN_FISCAL_METHOD_VERSION,
} from "../lib/risk-gate-v2-eurostat-sovereign-fiscal";

const COUNTRIES = [
  "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA",
  "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD",
];

function snapshot(count = COUNTRIES.length) {
  return buildMacroNormalizationSnapshot({
    metric: EUROSTAT_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: "2026-09-14T00:00:00.000Z",
    observations: COUNTRIES.slice(0, count).map((country, index) => ({
      country_iso3: country,
      metric: EUROSTAT_SOVEREIGN_FISCAL_METRIC,
      value_numeric: 20 + index * 4,
      unit: "percent_of_gdp",
      observed_at: "2026-06-30T23:59:59.999Z",
      freshness_status: "CURRENT" as const,
    })),
  });
}

const cleanManifest = {
  release_id: "gov_10q_ggdebt:2026-Q1",
  manifest_hash: "a".repeat(64),
  verified_rows: 28,
  partial_rows: 0,
  rejected_rows: 0,
  unmapped_rows: 0,
  write_completed: true,
};

describe("Eurostat sovereign-fiscal methodology", () => {
  it("builds a LIMITED verified fiscal state from a concept-consistent peer universe", () => {
    const state = buildRiskGateV2EurostatSovereignFiscalModuleState({
      country_iso3: "DEU",
      generated_at: "2026-09-14T00:00:00.000Z",
      snapshot: snapshot(),
      manifest: cleanManifest,
    });

    expect(state).not.toBeNull();
    expect(state?.module).toBe("sovereign_fiscal");
    expect(state?.coverage).toBe("LIMITED");
    expect(state?.commercial_eligibility_status).toBe("VERIFIED");
    expect(state?.methodology_version).toBe(
      RISK_GATE_V2_EUROSTAT_SOVEREIGN_FISCAL_METHOD_VERSION,
    );
    expect(state?.drivers).toHaveLength(1);
    expect(state?.drivers[0]?.driver).toBe("debt_sustainability");
  });

  it("fails closed when release evidence is incomplete", () => {
    const state = buildRiskGateV2EurostatSovereignFiscalModuleState({
      country_iso3: "DEU",
      generated_at: "2026-09-14T00:00:00.000Z",
      snapshot: snapshot(),
      manifest: { ...cleanManifest, unmapped_rows: 1 },
    });
    expect(state).toBeNull();
  });

  it("requires at least twenty concept-consistent peers", () => {
    expect(() => snapshot(19)).toThrow(
      `Insufficient peer coverage for ${EUROSTAT_SOVEREIGN_FISCAL_METRIC}: 19`,
    );
  });
});

describe("WDI debt coverage isolation", () => {
  it("recognizes only the expected sparse government-debt peer failure", () => {
    expect(
      isExpectedSparseWdiDebtCoverageError(
        "government_debt",
        "central_government_debt_pct_gdp",
        new Error("Insufficient peer coverage for central_government_debt_pct_gdp: 17"),
      ),
    ).toBe(true);

    expect(
      isExpectedSparseWdiDebtCoverageError(
        "inflation",
        "inflation_consumer_prices_annual_pct",
        new Error("Insufficient peer coverage for inflation_consumer_prices_annual_pct: 17"),
      ),
    ).toBe(false);

    expect(
      isExpectedSparseWdiDebtCoverageError(
        "government_debt",
        "central_government_debt_pct_gdp",
        new Error("World Bank WDI source is not operational for commercial macro signals"),
      ),
    ).toBe(false);
  });
});
