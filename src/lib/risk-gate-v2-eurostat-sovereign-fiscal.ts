import type { MacroNormalizationSnapshot } from "./country-risk-v02-normalization-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_EUROSTAT_SOVEREIGN_FISCAL_METHOD_VERSION =
  "risk-gate-v2-sovereign-fiscal-eurostat-general-government-0.1.0" as const;

export const RISK_GATE_V2_EUROSTAT_SOVEREIGN_FISCAL_TTL_MS =
  24 * 60 * 60 * 1000;

export const EUROSTAT_SOVEREIGN_FISCAL_METRIC =
  "general_government_gross_debt_pct_gdp" as const;

export const EUROSTAT_SOVEREIGN_FISCAL_MIN_PEERS = 20 as const;

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function parseTimestamp(value: string, label: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return timestamp;
}

function freshnessConfidence(freshness: string) {
  if (freshness === "CURRENT") return 1;
  if (freshness === "AGING") return 0.75;
  return 0;
}

export type EurostatSovereignFiscalManifestEvidence = {
  release_id: string;
  manifest_hash: string;
  verified_rows: number;
  partial_rows: number;
  rejected_rows: number;
  unmapped_rows: number;
  write_completed: boolean;
};

/**
 * Build a sovereign-fiscal module state from one concept-consistent Eurostat
 * general-government peer universe. This method never mixes Eurostat values
 * with World Bank central-government debt values.
 */
export function buildRiskGateV2EurostatSovereignFiscalModuleState(input: {
  country_iso3: string;
  generated_at: string;
  snapshot: MacroNormalizationSnapshot;
  manifest: EurostatSovereignFiscalManifestEvidence;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("Eurostat sovereign-fiscal module requires a valid country ISO3");
  }

  if (input.snapshot.metric !== EUROSTAT_SOVEREIGN_FISCAL_METRIC) {
    throw new Error("Eurostat sovereign-fiscal normalization metric mismatch");
  }

  if (input.snapshot.direction !== "HIGHER_IS_HIGHER_RISK") {
    throw new Error("Eurostat sovereign-fiscal debt direction must be HIGHER_IS_HIGHER_RISK");
  }

  if (input.snapshot.peer_count < EUROSTAT_SOVEREIGN_FISCAL_MIN_PEERS) {
    return null;
  }

  const manifest = input.manifest;
  if (
    !manifest.write_completed ||
    manifest.verified_rows < EUROSTAT_SOVEREIGN_FISCAL_MIN_PEERS ||
    manifest.partial_rows !== 0 ||
    manifest.rejected_rows !== 0 ||
    manifest.unmapped_rows !== 0 ||
    !/^[0-9a-f]{64}$/.test(manifest.manifest_hash)
  ) {
    return null;
  }

  const signal = input.snapshot.signals.find(
    (candidate) => candidate.country_iso3 === iso3,
  );
  if (
    !signal ||
    !Number.isFinite(signal.normalized_risk_score) ||
    !["CURRENT", "AGING"].includes(signal.freshness_status)
  ) {
    return null;
  }

  const generatedAt = parseTimestamp(input.generated_at, "generated_at");
  const expiresAt = new Date(
    generatedAt.getTime() + RISK_GATE_V2_EUROSTAT_SOVEREIGN_FISCAL_TTL_MS,
  );
  const confidence = freshnessConfidence(signal.freshness_status);
  const score = round6(signal.normalized_risk_score);

  const moduleStateId = [
    "rgv2",
    iso3,
    "sovereign_fiscal",
    "eurostat-ggdebt",
    input.snapshot.calculation_hash.slice(0, 16),
    manifest.manifest_hash.slice(0, 16),
  ].join(":");

  return {
    module_state_id: moduleStateId,
    module: "sovereign_fiscal",
    score,
    previous_score: null,
    delta: null,
    confidence,
    coverage: "LIMITED",
    commercial_eligibility_status: "VERIFIED",
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    methodology_version: RISK_GATE_V2_EUROSTAT_SOVEREIGN_FISCAL_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: [
      {
        driver: "debt_sustainability",
        score_contribution: score,
        delta_contribution: null,
        confidence,
      },
    ],
  };
}
