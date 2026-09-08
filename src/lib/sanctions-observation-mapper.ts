import type {
  SanctionsProgramEvidence,
} from "./sanctions-evidence-contract";


export const SANCTIONS_OBSERVATION_MAPPING_VERSION =
  "sanctions-observation-mapping-v0.1.0" as const;


export type SanctionsObservationInput = {
  sourceId:
    "ofac_sanctions_program";

  sourceRecordId:
    string;

  category:
    "GEOPOLITICS";

  countryIso3:
    string | null;

  partnerCountryIso3:
    null;

  observedAt:
    string;

  publishedAt:
    string;

  metric:
    "sanctions_program_designation_count";

  valueNumeric:
    number;

  valueText:
    string;

  unit:
    "designations";

  commodity:
    null;

  eventType:
    null;

  signalType:
    "sanctions_coercion_structural";

  sourceUrl:
    string;

  provenance: {
    mapping_version:
      typeof SANCTIONS_OBSERVATION_MAPPING_VERSION;

    source:
      string;

    program:
      string;

    attribution_mode:
      string;

    attribution_reason:
      string | null;

    methodology_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02";

    /**
     * Source-policy review state. This is intentionally more
     * descriptive than the persisted observation eligibility enum.
     */
    commercial_status:
      "REVIEW_REQUIRED";

    raw_customer_redistribution:
      false;
  };

  rawPayload:
    SanctionsProgramEvidence;

  qualityStatus:
    "VERIFIED";

  /**
   * `live_external_observations.commercial_eligibility_status`
   * accepts UNVERIFIED / VERIFIED / DERIVED_ONLY / BLOCKED.
   * A registry/policy state of REVIEW_REQUIRED therefore maps to
   * persisted observation state UNVERIFIED until review completes.
   */
  commercialEligibilityStatus:
    "UNVERIFIED";
};


export function mapSanctionsEvidenceToObservationInput(
  evidence:
    SanctionsProgramEvidence,
): SanctionsObservationInput {

  const countryIso3 =
    evidence.attribution_mode ===
      "DIRECT_JURISDICTION"
      ? evidence.jurisdiction_iso3
      : null;


  const attributionReason =
    evidence.attribution_mode ===
      "NO_DIRECT_JURISDICTION"
      ? evidence.attribution_reason
      : null;


  return {
    sourceId:
      "ofac_sanctions_program",

    sourceRecordId:
      `${evidence.source}:${evidence.program}:${evidence.retrieved_at}`,

    category:
      "GEOPOLITICS",

    countryIso3,

    partnerCountryIso3:
      null,

    observedAt:
      evidence.retrieved_at,

    publishedAt:
      evidence.retrieved_at,

    metric:
      "sanctions_program_designation_count",

    valueNumeric:
      evidence.designation_count,

    valueText:
      evidence.program,

    unit:
      "designations",

    commodity:
      null,

    eventType:
      null,

    signalType:
      "sanctions_coercion_structural",

    sourceUrl:
      evidence.source_url,

    provenance: {
      mapping_version:
        SANCTIONS_OBSERVATION_MAPPING_VERSION,

      source:
        evidence.source,

      program:
        evidence.program,

      attribution_mode:
        evidence.attribution_mode,

      attribution_reason:
        attributionReason,

      methodology_status:
        evidence.methodology_status,

      commercial_status:
        evidence.commercial_status,

      raw_customer_redistribution:
        false,
    },

    rawPayload:
      evidence,

    qualityStatus:
      "VERIFIED",

    commercialEligibilityStatus:
      "UNVERIFIED",
  };
}
