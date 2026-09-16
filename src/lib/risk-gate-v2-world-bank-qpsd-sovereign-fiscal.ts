import type { MacroNormalizationSnapshot } from "./country-risk-v02-normalization-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC =
  "qpsd_general_government_gross_debt_pct_gdp" as const;
export const WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC =
  "qpsd_central_government_gross_debt_pct_gdp" as const;

export type WorldBankQpsdMetric =
  | typeof WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC
  | typeof WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC;

export const RISK_GATE_V2_WORLD_BANK_QPSD_SOVEREIGN_FISCAL_METHOD_VERSION =
  "risk-gate-v2-sovereign-fiscal-world-bank-qpsd-source-specific-0.1.0" as const;
export const WORLD_BANK_QPSD_SOVEREIGN_FISCAL_MIN_PEERS = 20 as const;
export const WORLD_BANK_QPSD_SOVEREIGN_FISCAL_TTL_MS = 24 * 60 * 60 * 1000;
export const WORLD_BANK_QPSD_PARSER_VERSION =
  "world-bank-qpsd-bulk-v0.1.0" as const;

const SERIES = Object.freeze({
  [WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC]: {
    series_id: "DP.DOD.DECT.CR.GG.Z1",
    government_sector: "GENERAL_GOVERNMENT",
    exact_label:
      "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP",
    state_slug: "world-bank-qpsd-general-government",
  },
  [WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC]: {
    series_id: "DP.DOD.DECT.CR.CG.Z1",
    government_sector: "CENTRAL_GOVERNMENT",
    exact_label:
      "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP",
    state_slug: "world-bank-qpsd-central-government",
  },
} as const);

export type WorldBankQpsdSourceProof = {
  source_transport: "official_databank_bulk_csv";
  dataset_classification: "Public";
  dataset_license: "CC BY 4.0";
  parser_version: typeof WORLD_BANK_QPSD_PARSER_VERSION;
  bulk_file_sha256: string;
  series_id:
    | "DP.DOD.DECT.CR.GG.Z1"
    | "DP.DOD.DECT.CR.CG.Z1";
  exact_label:
    | "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP"
    | "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP";
  government_sector: "GENERAL_GOVERNMENT" | "CENTRAL_GOVERNMENT";
  unit: "% of GDP";
  cross_concept_pooling_allowed: false;
  raw_cross_source_pooling_allowed: false;
};

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

function isWorldBankQpsdMetric(value: string): value is WorldBankQpsdMetric {
  return value in SERIES;
}

function validProof(metric: WorldBankQpsdMetric, proof: WorldBankQpsdSourceProof) {
  const expected = SERIES[metric];
  return (
    proof.source_transport === "official_databank_bulk_csv" &&
    proof.dataset_classification === "Public" &&
    proof.dataset_license === "CC BY 4.0" &&
    proof.parser_version === WORLD_BANK_QPSD_PARSER_VERSION &&
    /^[0-9a-f]{64}$/.test(proof.bulk_file_sha256) &&
    proof.series_id === expected.series_id &&
    proof.exact_label === expected.exact_label &&
    proof.government_sector === expected.government_sector &&
    proof.unit === "% of GDP" &&
    proof.cross_concept_pooling_allowed === false &&
    proof.raw_cross_source_pooling_allowed === false
  );
}

/**
 * Source-specific QPSD sovereign-fiscal module state.
 *
 * General-government and central-government debt are intentionally separate
 * peer universes. This builder never combines their raw values and never pools
 * QPSD with WDI/Eurostat. Production activation remains gated by the server
 * adapter's source registry, exact-manifest and commercial-eligibility checks.
 */
export function buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState(input: {
  country_iso3: string;
  generated_at: string;
  snapshot: MacroNormalizationSnapshot;
  source_proof: WorldBankQpsdSourceProof;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("World Bank QPSD sovereign-fiscal module requires a valid country ISO3");
  }
  if (!isWorldBankQpsdMetric(input.snapshot.metric)) {
    throw new Error("World Bank QPSD sovereign-fiscal normalization metric mismatch");
  }
  if (input.snapshot.direction !== "HIGHER_IS_HIGHER_RISK") {
    throw new Error("World Bank QPSD debt direction must be HIGHER_IS_HIGHER_RISK");
  }
  if (input.snapshot.peer_count < WORLD_BANK_QPSD_SOVEREIGN_FISCAL_MIN_PEERS) {
    return null;
  }

  const metric = input.snapshot.metric;
  if (!validProof(metric, input.source_proof)) return null;

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
    generatedAt.getTime() + WORLD_BANK_QPSD_SOVEREIGN_FISCAL_TTL_MS,
  );
  const score = round6(signal.normalized_risk_score);
  const confidence = freshnessConfidence(signal.freshness_status);
  const expected = SERIES[metric];

  return {
    module_state_id: [
      "rgv2",
      iso3,
      "sovereign_fiscal",
      expected.state_slug,
      input.snapshot.calculation_hash.slice(0, 16),
      input.source_proof.bulk_file_sha256.slice(0, 16),
    ].join(":"),
    module: "sovereign_fiscal",
    score,
    previous_score: null,
    delta: null,
    confidence,
    coverage: "LIMITED",
    commercial_eligibility_status: "VERIFIED",
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    methodology_version:
      RISK_GATE_V2_WORLD_BANK_QPSD_SOVEREIGN_FISCAL_METHOD_VERSION,
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
