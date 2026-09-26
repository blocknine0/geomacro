import type { AgentQueryPlan } from "./agent-query-plan";
import { checkCommercialSourceEligibility } from "./commercial-source-eligibility.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { generateCountryRiskGateV2WdiMacroModuleStates } from "./risk-gate-v2-macro-module-state.server";
import { generateRiskGateV2FinancialModuleState } from "./risk-gate-v2-financial-module-state.server";

export const AGENT_WORLD_BANK_SOURCE_ID = "world_bank_indicators" as const;

export type AgentWorldBankModuleName =
  | "macro_monetary"
  | "sovereign_fiscal"
  | "external_fx";

const METRICS: Record<AgentWorldBankModuleName, readonly string[]> = {
  macro_monetary: [
    "inflation_consumer_prices_annual_pct",
    "real_gdp_growth_annual_pct",
    "unemployment_total_pct",
  ],
  sovereign_fiscal: ["central_government_debt_pct_gdp"],
  external_fx: ["total_reserves_months_imports", "current_account_balance_pct_gdp"],
};

export type AgentWorldBankModuleResult = {
  deliverable: boolean;
  code:
    | "AVAILABLE"
    | "NOT_COUNTRY_SUBJECT"
    | "SOURCE_NOT_ELIGIBLE"
    | "OBSERVATION_NOT_AVAILABLE"
    | "OBSERVATION_STALE"
    | "MODULE_NOT_VERIFIED";
  module: AgentWorldBankModuleName;
  subject: AgentQueryPlan["subjects"][number];
  source_id: typeof AGENT_WORLD_BANK_SOURCE_ID;
  source_observed_at: string | null;
  source_normalized_hashes: string[];
  source_contract: {
    commercial_usage_status: string | null;
    raw_redistribution_allowed: boolean;
    attribution_required: boolean;
    licence_name: string | null;
  } | null;
  state: null | {
    module: string;
    score: number;
    previous_score: number | null;
    delta: number | null;
    confidence: number;
    coverage: string;
    commercial_eligibility_status: string;
    generated_at: string;
    expires_at: string;
    methodology_version: string;
    drivers: Array<{
      driver: string;
      score_contribution: number;
      delta_contribution: number | null;
      confidence: number;
    }>;
  };
};

function unavailable(
  module: AgentWorldBankModuleName,
  subject: AgentQueryPlan["subjects"][number],
  code: AgentWorldBankModuleResult["code"],
  sourceContract: AgentWorldBankModuleResult["source_contract"] = null,
  sourceObservedAt: string | null = null,
  sourceNormalizedHashes: string[] = [],
): AgentWorldBankModuleResult {
  return {
    deliverable: false,
    code,
    module,
    subject,
    source_id: AGENT_WORLD_BANK_SOURCE_ID,
    source_observed_at: sourceObservedAt,
    source_normalized_hashes: sourceNormalizedHashes,
    source_contract: sourceContract,
    state: null,
  };
}

function publicState(state: {
  module: string;
  score: number;
  previous_score: number | null;
  delta: number | null;
  confidence: number;
  coverage: string;
  commercial_eligibility_status: string;
  generated_at: string;
  expires_at: string;
  methodology_version: string;
  drivers: Array<{
    driver: string;
    score_contribution: number;
    delta_contribution: number | null;
    confidence: number;
  }>;
}) {
  return {
    module: state.module,
    score: state.score,
    previous_score: state.previous_score,
    delta: state.delta,
    confidence: state.confidence,
    coverage: state.coverage,
    commercial_eligibility_status: state.commercial_eligibility_status,
    generated_at: state.generated_at,
    expires_at: state.expires_at,
    methodology_version: state.methodology_version,
    drivers: state.drivers.map((driver) => ({
      driver: driver.driver,
      score_contribution: driver.score_contribution,
      delta_contribution: driver.delta_contribution,
      confidence: driver.confidence,
    })),
  };
}

export async function loadAgentWorldBankModule(input: {
  module: AgentWorldBankModuleName;
  subject: AgentQueryPlan["subjects"][number];
  as_of: string;
  max_age_seconds: number;
}): Promise<AgentWorldBankModuleResult> {
  if (input.subject.type !== "country") {
    return unavailable(input.module, input.subject, "NOT_COUNTRY_SUBJECT");
  }

  const source = await checkCommercialSourceEligibility(AGENT_WORLD_BANK_SOURCE_ID);
  const sourceContract = {
    commercial_usage_status: source.commercial_usage_status,
    raw_redistribution_allowed: source.raw_redistribution_allowed,
    attribution_required: source.attribution_required,
    licence_name: source.licence_name,
  };
  if (!source.eligible) {
    return unavailable(input.module, input.subject, "SOURCE_NOT_ELIGIBLE", sourceContract);
  }

  const db = requireRiskSupabase();
  const observations = await db
    .from("live_external_observations")
    .select("metric,observed_at,normalized_hash,commercial_eligibility_status")
    .eq("source_id", AGENT_WORLD_BANK_SOURCE_ID)
    .eq("country_iso3", input.subject.country_iso3)
    .eq("quality_status", "VERIFIED")
    .in("metric", [...METRICS[input.module]])
    .lte("observed_at", input.as_of)
    .order("observed_at", { ascending: false })
    .limit(100);
  if (observations.error) throw observations.error;

  const rows = observations.data ?? [];
  if (rows.length === 0) {
    return unavailable(input.module, input.subject, "OBSERVATION_NOT_AVAILABLE", sourceContract);
  }

  const asOfMs = Date.parse(input.as_of);
  const latestMs = Math.max(
    ...rows
      .map((row) => Date.parse(String(row.observed_at ?? "")))
      .filter(Number.isFinite),
  );
  const latestObservedAt = Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null;
  const hashes = [...new Set(rows
    .map((row) => typeof row.normalized_hash === "string" ? row.normalized_hash : null)
    .filter((value): value is string => Boolean(value)))].sort();

  if (
    !Number.isFinite(asOfMs) ||
    latestObservedAt === null ||
    !Number.isFinite(input.max_age_seconds) ||
    input.max_age_seconds <= 0 ||
    asOfMs - latestMs > input.max_age_seconds * 1_000
  ) {
    return unavailable(
      input.module,
      input.subject,
      "OBSERVATION_STALE",
      sourceContract,
      latestObservedAt,
      hashes,
    );
  }

  if (rows.some((row) => row.commercial_eligibility_status !== "VERIFIED")) {
    return unavailable(
      input.module,
      input.subject,
      "MODULE_NOT_VERIFIED",
      sourceContract,
      latestObservedAt,
      hashes,
    );
  }

  const generatedAt = new Date().toISOString();
  let state = null;
  if (input.module === "external_fx") {
    state = await generateRiskGateV2FinancialModuleState({
      country_iso3: input.subject.country_iso3,
      module: "currency_capital_mobility",
      as_of: input.as_of,
      generated_at: generatedAt,
    });
  } else {
    const states = await generateCountryRiskGateV2WdiMacroModuleStates({
      country_iso3: input.subject.country_iso3,
      as_of: input.as_of,
      generated_at: generatedAt,
    });
    state = states.find((candidate) => candidate.module === input.module) ?? null;
  }

  if (!state || state.commercial_eligibility_status !== "VERIFIED") {
    return unavailable(
      input.module,
      input.subject,
      "MODULE_NOT_VERIFIED",
      sourceContract,
      latestObservedAt,
      hashes,
    );
  }

  return {
    deliverable: true,
    code: "AVAILABLE",
    module: input.module,
    subject: input.subject,
    source_id: AGENT_WORLD_BANK_SOURCE_ID,
    source_observed_at: latestObservedAt,
    source_normalized_hashes: hashes,
    source_contract: sourceContract,
    state: publicState(state),
  };
}
