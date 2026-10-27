import { sourceNativeObservationTime } from "./source-native-observation-time";
import type { StructuralObservation } from "./structural-context.server";

export const PRIVATE_QUALIFICATION_METADATA_VERSION =
  "geomacro.private-evidence-qualification.v1" as const;
export type EvidenceDecision = "ELIGIBLE" | "INELIGIBLE" | "NOT_ESTABLISHED";
export type EvidenceVerification = "VERIFIED" | "UNVERIFIED" | "UNKNOWN";

export type QualificationInputs = {
  as_of: string;
  max_age_seconds: number;
  /** Reviewed registry snapshot, never parsed from customer request/body. */
  source_commercial_eligible: boolean | null;
  /** Signed/certified source record verification, not a self-assertion. */
  source_verified: boolean | null;
  /** Original independent source families after same-event deduplication. */
  independently_verified_source_families?: readonly string[];
  /** Same-event corroboration references already verified by the producer. */
  corroborating_normalized_hashes?: readonly string[];
};

export function privateQualificationMetadata(row: StructuralObservation, inputs: QualificationInputs) {
  const asOf = Date.parse(inputs.as_of);
  if (!Number.isFinite(asOf) || !Number.isFinite(inputs.max_age_seconds) ||
      inputs.max_age_seconds <= 0 || inputs.max_age_seconds > 94_608_000)
    throw Error("PRIVATE_QUALIFICATION_CONFIGURATION_INVALID");
  const observed = sourceNativeObservationTime(row, asOf);
  const publishedAt = typeof row.published_at === "string" &&
    Number.isFinite(Date.parse(row.published_at)) && Date.parse(row.published_at) <= asOf
    ? new Date(Date.parse(row.published_at)).toISOString() : null;
  const retrievedAt = typeof row.retrieved_at === "string" &&
    Number.isFinite(Date.parse(row.retrieved_at))
    ? new Date(Date.parse(row.retrieved_at)).toISOString() : null;
  const sourceFamilies = new Set(
    (inputs.independently_verified_source_families ?? [])
      .filter(x => typeof x === "string" && x.trim().length > 0),
  );
  const corroboration = [...new Set((inputs.corroborating_normalized_hashes ?? [])
    .filter(x => typeof x === "string" && /^[a-f0-9]{64}$/u.test(x) &&
      x !== row.normalized_hash))].sort();
  const ageSeconds = observed === null ? null : Math.floor((asOf - observed) / 1000);
  const current = ageSeconds !== null && ageSeconds >= 0 && ageSeconds <= inputs.max_age_seconds;
  const quality = (row.quality_status ?? "").toUpperCase();
  const qualityVerified = quality === "VERIFIED" || quality === "ACCEPTED";
  const verified: EvidenceVerification = inputs.source_verified === true && qualityVerified
    ? "VERIFIED" : inputs.source_verified === false || !qualityVerified
      ? "UNVERIFIED" : "UNKNOWN";
  const eligibility: EvidenceDecision = inputs.source_commercial_eligible === true &&
    verified === "VERIFIED" && current
    ? "ELIGIBLE" : inputs.source_commercial_eligible === false || verified === "UNVERIFIED" ||
      (ageSeconds !== null && !current)
      ? "INELIGIBLE" : "NOT_ESTABLISHED";
  return {
    schema_version: PRIVATE_QUALIFICATION_METADATA_VERSION,
    /** Must remain internal and be joined only on already-verified canonical evidence. */
    evidence_id: row.source_id + ":" + row.observation_id,
    country_iso3: row.country_iso3,
    dimension: row.dimension,
    original_published_at: publishedAt,
    observed_at: observed === null ? null : new Date(observed).toISOString(),
    retrieved_at_internal: retrievedAt,
    independent_source_family_count: sourceFamilies.size,
    corroborating_evidence_count: corroboration.length,
    corroborating_hashes_internal: corroboration,
    source_independence: sourceFamilies.size >= 2 ? "CORROBORATED_INDEPENDENT"
      : sourceFamilies.size === 1 ? "SINGLE_VERIFIED_FAMILY" : "NOT_ESTABLISHED",
    freshness: {
      age_seconds: ageSeconds,
      max_age_seconds: inputs.max_age_seconds,
      status: ageSeconds === null ? "UNKNOWN" : current ? "CURRENT" : "STALE",
      clock_basis: "EARLIEST_SOURCE_NATIVE_OBSERVED_OR_PUBLISHED",
    },
    provenance: {
      normalized_hash: row.normalized_hash,
      source_record_id_internal: row.source_record_id,
      parser_version_internal: row.parser_version,
      internal_traceable: Boolean(row.source_id && row.observation_id && /^[a-f0-9]{64}$/u.test(row.normalized_hash)),
    },
    verification_state: verified,
    eligibility,
  } as const;
}
