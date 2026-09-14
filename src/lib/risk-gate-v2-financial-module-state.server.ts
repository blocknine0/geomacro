import type { MacroNormalizationInput } from "./country-risk-v02-normalization";
import { requireRiskSupabase } from "./risk-supabase.server";
import {
  buildRiskGateV2FinancialModuleState,
  type RiskGateV2FinancialModule,
} from "./risk-gate-v2-financial-module-state";

const FINANCIAL_METRICS = [
  "total_reserves_months_imports",
  "current_account_balance_pct_gdp",
  "bank_nonperforming_loans_pct",
  "bank_capital_to_assets_pct",
  "bank_liquid_reserves_to_assets_pct",
] as const;

function freshnessStatus(
  observedAt: string | null,
  asOf: Date,
): MacroNormalizationInput["freshness_status"] {
  if (!observedAt) return "UNKNOWN";
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return "UNKNOWN";
  const ageDays = Math.max(
    0,
    (asOf.getTime() - observed.getTime()) / 86_400_000,
  );
  if (ageDays <= 550) return "CURRENT";
  if (ageDays <= 900) return "AGING";
  return "STALE";
}

async function loadFinancialObservations(asOfIso: string) {
  const db = requireRiskSupabase();
  const asOf = new Date(asOfIso);
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("Risk Gate v2 financial as_of must be a valid timestamp");
  }

  const result = await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at")
    .in("metric", [...FINANCIAL_METRICS])
    .lte("observed_at", asOf.toISOString())
    .limit(5_000);

  if (result.error) throw result.error;

  const observations: MacroNormalizationInput[] = [];
  for (const row of result.data ?? []) {
    const iso3 =
      typeof row.country_iso3 === "string"
        ? row.country_iso3.trim().toUpperCase()
        : "";
    const metric = typeof row.metric === "string" ? row.metric : "";
    const value = Number(row.value_numeric);
    const observedAt =
      typeof row.observed_at === "string" ? row.observed_at : null;

    if (
      !/^[A-Z]{3}$/.test(iso3) ||
      !FINANCIAL_METRICS.includes(metric as (typeof FINANCIAL_METRICS)[number]) ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    observations.push({
      country_iso3: iso3,
      metric,
      value_numeric: value,
      unit: typeof row.unit === "string" ? row.unit : null,
      observed_at: observedAt,
      freshness_status: freshnessStatus(observedAt, asOf),
    });
  }

  return observations;
}

export async function generateRiskGateV2FinancialModuleState(input: {
  country_iso3: string;
  module: RiskGateV2FinancialModule;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const asOf = new Date(input.as_of);
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("Risk Gate v2 financial as_of must be a valid timestamp");
  }

  const observations = await loadFinancialObservations(asOf.toISOString());

  return buildRiskGateV2FinancialModuleState({
    country_iso3: input.country_iso3,
    module: input.module,
    as_of: asOf.toISOString(),
    observations,
    generated_at: input.generated_at ?? new Date().toISOString(),
    commercial_eligibility_status: "VERIFIED",
    risk_object_ids: input.risk_object_ids,
  });
}

export async function generateRiskGateV2SupportedFinancialStates(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const asOf = new Date(input.as_of);
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("Risk Gate v2 financial as_of must be a valid timestamp");
  }
  const observations = await loadFinancialObservations(asOf.toISOString());
  const generatedAt = input.generated_at ?? new Date().toISOString();

  return (["currency_capital_mobility", "banking_financial_system"] as const)
    .map((module) =>
      buildRiskGateV2FinancialModuleState({
        country_iso3: input.country_iso3,
        module,
        as_of: asOf.toISOString(),
        observations,
        generated_at: generatedAt,
        commercial_eligibility_status: "VERIFIED",
        risk_object_ids: input.risk_object_ids,
      }),
    )
    .filter((state): state is NonNullable<typeof state> => state !== null);
}
