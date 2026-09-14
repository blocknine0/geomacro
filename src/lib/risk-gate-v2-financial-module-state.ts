import { createHash } from "node:crypto";

import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "./country-risk-v02-normalization";
import type { RiskDirection } from "./country-risk-v02-feature-methodology";
import type { RiskGateV2CommercialEligibilityStatus } from "./risk-gate-v2-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";
import type { RiskGateV2Driver, RiskGateV2Module } from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_WDI_FINANCIAL_METHOD_VERSION =
  "risk-gate-v2-wdi-financial-0.1.0" as const;

export const RISK_GATE_V2_WDI_FINANCIAL_TTL_MS = 24 * 60 * 60 * 1000;

export type RiskGateV2FinancialModule =
  | "currency_capital_mobility"
  | "banking_financial_system";

type MetricRule = {
  metric: string;
  direction: RiskDirection;
  driver: RiskGateV2Driver;
};

const MODULE_RULES: Record<RiskGateV2FinancialModule, readonly MetricRule[]> = {
  currency_capital_mobility: [
    {
      metric: "total_reserves_months_imports",
      direction: "LOWER_IS_HIGHER_RISK",
      driver: "reserve_depletion",
    },
    {
      metric: "current_account_balance_pct_gdp",
      direction: "LOWER_IS_HIGHER_RISK",
      driver: "currency_shock",
    },
  ],
  banking_financial_system: [
    {
      metric: "bank_nonperforming_loans_pct",
      direction: "HIGHER_IS_HIGHER_RISK",
      driver: "credit_deterioration",
    },
    {
      metric: "bank_capital_to_assets_pct",
      direction: "LOWER_IS_HIGHER_RISK",
      driver: "banking_system_stress",
    },
    {
      metric: "bank_liquid_reserves_to_assets_pct",
      direction: "LOWER_IS_HIGHER_RISK",
      driver: "funding_stress",
    },
  ],
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function hash(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function metricFreshnessConfidence(status: MacroNormalizationInput["freshness_status"]) {
  if (status === "CURRENT") return 1;
  if (status === "AGING") return 0.7;
  return 0;
}

function scoreModule(input: {
  country_iso3: string;
  module: RiskGateV2FinancialModule;
  as_of: string;
  observations: MacroNormalizationInput[];
}) {
  const iso3 = input.country_iso3.trim().toUpperCase();
  const rules = MODULE_RULES[input.module];
  const results: Array<{
    rule: MetricRule;
    score: number;
    freshness: MacroNormalizationInput["freshness_status"];
    peer_count: number;
    calculation_hash: string;
  }> = [];

  for (const rule of rules) {
    try {
      const snapshot = buildMacroNormalizationSnapshot({
        metric: rule.metric,
        direction: rule.direction,
        as_of: input.as_of,
        observations: input.observations,
      });
      const signal = snapshot.signals.find((item) => item.country_iso3 === iso3);
      if (!signal) continue;
      results.push({
        rule,
        score: signal.normalized_risk_score,
        freshness: signal.freshness_status,
        peer_count: snapshot.peer_count,
        calculation_hash: snapshot.calculation_hash,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Insufficient peer coverage")
      ) {
        continue;
      }
      throw error;
    }
  }

  if (results.length === 0) return null;

  const score = round6(
    results.reduce((sum, item) => sum + item.score, 0) / results.length,
  );
  const freshnessConfidence =
    results.reduce(
      (sum, item) => sum + metricFreshnessConfidence(item.freshness),
      0,
    ) / results.length;
  const coverageConfidence = results.length / rules.length;
  const peerConfidence = Math.min(
    1,
    Math.min(...results.map((item) => item.peer_count)) / 100,
  );
  const confidence = round6(
    freshnessConfidence * coverageConfidence * peerConfidence,
  );

  const coverage =
    results.length === rules.length ||
    (input.module === "banking_financial_system" && results.length >= 2)
      ? "PARTIAL" as const
      : "LIMITED" as const;

  return {
    score,
    confidence,
    coverage,
    identity_hash: hash(results.map((item) => item.calculation_hash).sort()),
    drivers: results.map((item) => ({
      driver: item.rule.driver,
      score_contribution: round6(item.score / results.length),
      confidence: round6(
        metricFreshnessConfidence(item.freshness) * peerConfidence,
      ),
    })),
  };
}

export function buildRiskGateV2FinancialModuleState(input: {
  country_iso3: string;
  module: RiskGateV2FinancialModule;
  as_of: string;
  observations: MacroNormalizationInput[];
  previous_as_of?: string | null;
  previous_observations?: MacroNormalizationInput[] | null;
  generated_at: string;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("Risk Gate v2 financial module requires a valid country ISO3");
  }
  if (!MODULE_RULES[input.module]) {
    throw new Error("Unsupported Risk Gate v2 WDI financial module");
  }

  const generatedAt = new Date(input.generated_at);
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("generated_at must be a valid timestamp");
  }

  const current = scoreModule({
    country_iso3: iso3,
    module: input.module,
    as_of: input.as_of,
    observations: input.observations,
  });
  if (!current) return null;

  const previous =
    input.previous_as_of && input.previous_observations
      ? scoreModule({
          country_iso3: iso3,
          module: input.module,
          as_of: input.previous_as_of,
          observations: input.previous_observations,
        })
      : null;
  const previousScore = previous?.score ?? null;
  const delta =
    previousScore === null ? null : round6(current.score - previousScore);

  return {
    module_state_id: [
      "rgv2",
      iso3,
      input.module,
      current.identity_hash.slice(0, 24),
      generatedAt.getTime().toString(36),
    ].join(":"),
    module: input.module as RiskGateV2Module,
    score: current.score,
    previous_score: previousScore,
    delta,
    confidence: current.confidence,
    coverage: current.coverage,
    commercial_eligibility_status: input.commercial_eligibility_status,
    generated_at: generatedAt.toISOString(),
    expires_at: new Date(
      generatedAt.getTime() + RISK_GATE_V2_WDI_FINANCIAL_TTL_MS,
    ).toISOString(),
    methodology_version: RISK_GATE_V2_WDI_FINANCIAL_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: current.drivers.map((driver) => ({
      ...driver,
      delta_contribution: null,
    })),
  };
}
