import type { MacroNormalizationSnapshot } from "./country-risk-v02-normalization-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC =
  "ppg_external_debt_stock_pct_gni" as const;

export const RISK_GATE_V2_WORLD_BANK_PPG_SOVEREIGN_FISCAL_METHOD_VERSION =
  "risk-gate-v2-sovereign-fiscal-world-bank-ppg-external-debt-0.1.0" as const;

export const WORLD_BANK_PPG_SOVEREIGN_FISCAL_MIN_PEERS = 20 as const;
export const WORLD_BANK_PPG_SOVEREIGN_FISCAL_TTL_MS = 24 * 60 * 60 * 1000;

export type WorldBankPpgSourceProof = {
  numerator_indicator: "DT.DOD.DPPG.CD";
  denominator_indicator: "NY.GNP.MKTP.CD";
  numerator_license: "CC BY-4.0";
  denominator_license: "CC BY-4.0";
  numerator_response_sha256: string;
  denominator_response_sha256: string;
  same_country_same_year_join_required: true;
  semantic_boundary:
    "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT";
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

function validProof(proof: WorldBankPpgSourceProof) {
  return (
    proof.numerator_indicator === "DT.DOD.DPPG.CD" &&
    proof.denominator_indicator === "NY.GNP.MKTP.CD" &&
    proof.numerator_license === "CC BY-4.0" &&
    proof.denominator_license === "CC BY-4.0" &&
    /^[0-9a-f]{64}$/.test(proof.numerator_response_sha256) &&
    /^[0-9a-f]{64}$/.test(proof.denominator_response_sha256) &&
    proof.same_country_same_year_join_required === true &&
    proof.semantic_boundary ===
      "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT"
  );
}

/**
 * Shadow methodology for a source-specific sovereign external-debt-pressure
 * path inside Risk Gate v2's broad sovereign_fiscal module.
 *
 * This does NOT relabel PPG external debt as total/central/general-government
 * debt and never pools its raw values with WDI central-government, QPSD or
 * Eurostat general-government debt. It is intentionally a standalone peer
 * universe. Production wiring is a separate gated change.
 */
export function buildRiskGateV2WorldBankPpgSovereignFiscalModuleState(input: {
  country_iso3: string;
  generated_at: string;
  snapshot: MacroNormalizationSnapshot;
  source_proof: WorldBankPpgSourceProof;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("World Bank PPG sovereign-fiscal module requires a valid country ISO3");
  }
  if (input.snapshot.metric !== WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC) {
    throw new Error("World Bank PPG sovereign-fiscal normalization metric mismatch");
  }
  if (input.snapshot.direction !== "HIGHER_IS_HIGHER_RISK") {
    throw new Error("World Bank PPG external-debt pressure direction must be HIGHER_IS_HIGHER_RISK");
  }
  if (input.snapshot.peer_count < WORLD_BANK_PPG_SOVEREIGN_FISCAL_MIN_PEERS) {
    return null;
  }
  if (!validProof(input.source_proof)) {
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
    generatedAt.getTime() + WORLD_BANK_PPG_SOVEREIGN_FISCAL_TTL_MS,
  );
  const score = round6(signal.normalized_risk_score);
  const confidence = freshnessConfidence(signal.freshness_status);
  const proofHashPrefix = input.source_proof.numerator_response_sha256.slice(0, 8) +
    input.source_proof.denominator_response_sha256.slice(0, 8);

  return {
    module_state_id: [
      "rgv2",
      iso3,
      "sovereign_fiscal",
      "world-bank-ppg-external-debt",
      input.snapshot.calculation_hash.slice(0, 16),
      proofHashPrefix,
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
      RISK_GATE_V2_WORLD_BANK_PPG_SOVEREIGN_FISCAL_METHOD_VERSION,
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
