import { createHash } from "node:crypto";

import {
  computeEarlyWarningProofMetrics,
  evaluateProofPublicationReadiness,
  type ReplaySample,
} from "./early-warning-proof-metrics";

export const FOMC_SCOPED_PROOF_SCHEMA_VERSION =
  "early-warning-fomc-scoped-proof-samples-v1" as const;

const EXPECTED_SCOPE = {
  claim_scope_type: "MATERIALITY_RULE_SLICE",
  country_iso3: "USA",
  event_family: "monetary_policy",
  materiality_rule_code: "CB_POLICY_RATE_MOVE_25BP",
} as const;

export type FomcScopedProofArtifact = {
  schema_version: typeof FOMC_SCOPED_PROOF_SCHEMA_VERSION;
  claim_scope_type: typeof EXPECTED_SCOPE.claim_scope_type;
  country_iso3: typeof EXPECTED_SCOPE.country_iso3;
  event_family: typeof EXPECTED_SCOPE.event_family;
  materiality_rule_code: typeof EXPECTED_SCOPE.materiality_rule_code;
  slice_artifact_hash: string;
  control_artifact_hash: string;
  replay_artifact_hash: string;
  scope_hash: string;
  sample_count: number;
  material_event_sample_count: number;
  control_sample_count: number;
  samples_hash: string;
  samples: ReplaySample[];
  methodology_calibrated: false;
  material_event_universe_complete_for_this_rule_scoped_slice: true;
  control_period_sampling_documented: true;
  broad_monetary_policy_universe_complete: false;
  broad_country_risk_universe_complete: false;
  eligible_for_main_proof_metric_computation: true;
  eligible_for_public_performance_claims: false;
  public_performance_claims_allowed: false;
  commercial_signal_activation: false;
  market_price_prediction: false;
  proof_sample_artifact_hash: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function assertSha256(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${field} must be lowercase sha256 hex`);
  }
}

function assertIntegerCount(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

export function validateFomcScopedProofArtifact(
  raw: unknown,
): FomcScopedProofArtifact {
  if (!isRecord(raw)) throw new Error("FOMC scoped proof artifact must be an object");
  if (raw.schema_version !== FOMC_SCOPED_PROOF_SCHEMA_VERSION) {
    throw new Error("FOMC scoped proof artifact schema mismatch");
  }

  for (const [key, expected] of Object.entries(EXPECTED_SCOPE)) {
    if (raw[key] !== expected) throw new Error(`FOMC scoped proof ${key} mismatch`);
  }

  for (const field of [
    "slice_artifact_hash",
    "control_artifact_hash",
    "replay_artifact_hash",
    "scope_hash",
    "samples_hash",
    "proof_sample_artifact_hash",
  ]) {
    assertSha256(raw[field], field);
  }

  for (const field of [
    "sample_count",
    "material_event_sample_count",
    "control_sample_count",
  ]) {
    assertIntegerCount(raw[field], field);
  }

  if (raw.methodology_calibrated !== false) {
    throw new Error("FOMC scoped proof methodology must remain uncalibrated");
  }
  if (raw.material_event_universe_complete_for_this_rule_scoped_slice !== true) {
    throw new Error("FOMC rule-scoped material-event denominator must be complete");
  }
  if (raw.control_period_sampling_documented !== true) {
    throw new Error("FOMC scoped control-period sampling must be documented");
  }
  if (raw.broad_monetary_policy_universe_complete !== false) {
    throw new Error("broad monetary-policy completeness must remain false");
  }
  if (raw.broad_country_risk_universe_complete !== false) {
    throw new Error("broad country-risk completeness must remain false");
  }
  if (raw.eligible_for_main_proof_metric_computation !== true) {
    throw new Error("FOMC scoped proof metric-computation eligibility mismatch");
  }
  for (const field of [
    "eligible_for_public_performance_claims",
    "public_performance_claims_allowed",
    "commercial_signal_activation",
    "market_price_prediction",
  ]) {
    if (raw[field] !== false) throw new Error(`${field} must remain false`);
  }

  if (!Array.isArray(raw.samples)) throw new Error("FOMC scoped proof samples are required");
  if (raw.samples.length !== raw.sample_count) {
    throw new Error("FOMC scoped proof sample_count mismatch");
  }
  if (raw.sample_count !== raw.material_event_sample_count + raw.control_sample_count) {
    throw new Error("FOMC scoped proof denominator counts do not add up");
  }
  if (stableHash(raw.samples) !== raw.samples_hash) {
    throw new Error("FOMC scoped proof samples_hash mismatch");
  }

  let materialEvents = 0;
  let controls = 0;
  const seen = new Set<string>();
  for (const sample of raw.samples as ReplaySample[]) {
    if (!isRecord(sample)) throw new Error("FOMC scoped proof sample must be an object");
    if (typeof sample.sample_id !== "string" || !/^[0-9a-f]{64}$/.test(sample.sample_id)) {
      throw new Error("FOMC scoped proof sample_id must be sha256 hex");
    }
    if (seen.has(sample.sample_id)) throw new Error("duplicate FOMC scoped proof sample_id");
    seen.add(sample.sample_id);
    if (sample.country_iso3 !== "USA" || sample.event_family !== "monetary_policy") {
      throw new Error("FOMC scoped proof sample escaped the declared scope");
    }
    if (sample.outcome === "MATERIAL_EVENT") materialEvents += 1;
    else if (sample.outcome === "NO_MATERIAL_EVENT") controls += 1;
    else throw new Error("FOMC scoped proof cannot contain INVALIDATED samples");
  }
  if (materialEvents !== raw.material_event_sample_count) {
    throw new Error("FOMC scoped proof material-event count mismatch");
  }
  if (controls !== raw.control_sample_count) {
    throw new Error("FOMC scoped proof control count mismatch");
  }

  const artifactCore = Object.fromEntries(
    Object.entries(raw).filter(([key]) => key !== "proof_sample_artifact_hash"),
  );
  if (stableHash(artifactCore) !== raw.proof_sample_artifact_hash) {
    throw new Error("FOMC scoped proof artifact hash mismatch");
  }

  return raw as FomcScopedProofArtifact;
}

export function consumeFomcScopedProofArtifact(raw: unknown) {
  const artifact = validateFomcScopedProofArtifact(raw);
  const metrics = computeEarlyWarningProofMetrics(artifact.samples);
  const publicationReadiness = evaluateProofPublicationReadiness({
    methodology_calibrated: false,
    material_event_universe_complete: true,
    control_period_sampling_documented: true,
    samples: artifact.samples,
    minimum_resolved_samples: 100,
    minimum_material_events: 30,
    minimum_countries: 5,
  });

  if (publicationReadiness.publishable) {
    throw new Error("rule-scoped one-country FOMC proof cannot authorize broad publication");
  }

  return {
    scope: { ...EXPECTED_SCOPE },
    source_artifact_hash: artifact.proof_sample_artifact_hash,
    metrics,
    publication_readiness: publicationReadiness,
    scope_publication_allowed: false as const,
    public_performance_claims_allowed: false as const,
    commercial_signal_activation: false as const,
    market_price_prediction: false as const,
  };
}
