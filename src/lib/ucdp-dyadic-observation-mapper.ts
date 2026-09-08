import type {
  UcdpInterstateDyadEvidence,
  UcdpDyadicRawRecord,
} from "./ucdp-dyadic-contract";

export const UCDP_DYADIC_OBSERVATION_MAPPING_VERSION =
  "ucdp-dyadic-observation-mapping-v0.1.0" as const;

export type UcdpDyadicObservationInput = {
  sourceId: "ucdp_dyadic";
  sourceRecordId: string;
  category: "GEOPOLITICS";
  countryIso3: null;
  partnerCountryIso3: null;
  observedAt: string;
  publishedAt: null;
  metric: "interstate_conflict_dyad";
  valueNumeric: number;
  valueText: string;
  unit: "dyad";
  commodity: null;
  eventType: "interstate_conflict";
  signalType: "interstate_tension";
  sourceUrl: string;
  provenance: {
    mapping_version: typeof UCDP_DYADIC_OBSERVATION_MAPPING_VERSION;
    dataset: "UCDP Dyadic Dataset";
    dataset_version: "26.1";
    dyad_id: string;
    conflict_id: string;
    year: number;
    side_a: string;
    side_a_id: string;
    side_b: string;
    side_b_id: string;
    type_of_conflict: 2;
    intensity_level: number | null;
    location: string | null;
    methodology_status: "EVIDENCE_ONLY_NOT_IN_GRO_V02";
    commercial_status: "REVIEW_REQUIRED";
  };
  rawPayload: UcdpDyadicRawRecord;
  qualityStatus: "VERIFIED";
  commercialEligibilityStatus: "UNVERIFIED";
};

function observedAtFromEvidence(evidence: UcdpInterstateDyadEvidence): string {
  const candidate = evidence.start_date2 ?? evidence.start_date;
  if (candidate && Number.isFinite(Date.parse(candidate))) {
    return new Date(candidate).toISOString();
  }
  return `${evidence.year}-01-01T00:00:00.000Z`;
}

export function mapUcdpDyadicEvidenceToObservationInput(input: {
  evidence: UcdpInterstateDyadEvidence;
  raw: UcdpDyadicRawRecord;
  source_url: string;
}): UcdpDyadicObservationInput {
  const observedAt = observedAtFromEvidence(input.evidence);

  return {
    sourceId: "ucdp_dyadic",
    sourceRecordId: `${input.evidence.dataset_version}:${input.evidence.dyad_id}:${input.evidence.year}`,
    category: "GEOPOLITICS",
    countryIso3: null,
    partnerCountryIso3: null,
    observedAt,
    publishedAt: null,
    metric: "interstate_conflict_dyad",
    valueNumeric: input.evidence.intensity_level ?? 1,
    valueText: `${input.evidence.side_a} vs ${input.evidence.side_b}`,
    unit: "dyad",
    commodity: null,
    eventType: "interstate_conflict",
    signalType: "interstate_tension",
    sourceUrl: input.source_url,
    provenance: {
      mapping_version: UCDP_DYADIC_OBSERVATION_MAPPING_VERSION,
      dataset: "UCDP Dyadic Dataset",
      dataset_version: input.evidence.dataset_version,
      dyad_id: input.evidence.dyad_id,
      conflict_id: input.evidence.conflict_id,
      year: input.evidence.year,
      side_a: input.evidence.side_a,
      side_a_id: input.evidence.side_a_id,
      side_b: input.evidence.side_b,
      side_b_id: input.evidence.side_b_id,
      type_of_conflict: 2,
      intensity_level: input.evidence.intensity_level,
      location: input.evidence.location,
      methodology_status: input.evidence.methodology_status,
      commercial_status: "REVIEW_REQUIRED",
    },
    rawPayload: input.raw,
    qualityStatus: "VERIFIED",
    // REVIEW_REQUIRED remains visible in provenance; persistence fails closed.
    commercialEligibilityStatus: "UNVERIFIED",
  };
}
