import type {
  WgiPoliticalStabilityBundle,
  WgiRawObservation,
} from "./wgi-political-stability-contract";


export const WGI_POLITICAL_STABILITY_MAPPING_VERSION =
  "wgi-political-stability-observation-mapping-v0.1.0" as const;


export type WgiObservationInput = {
  sourceId:
    "world_bank_wgi_political_stability";

  sourceRecordId:
    string;

  category:
    "GEOPOLITICS";

  countryIso3:
    string;

  partnerCountryIso3:
    null;

  observedAt:
    string;

  publishedAt:
    string;

  metric:
    "political_stability_absolute_score";

  valueNumeric:
    number;

  valueText:
    null;

  unit:
    "score_0_100";

  commodity:
    null;

  eventType:
    null;

  signalType:
    "political_instability_structural";

  sourceUrl:
    string;

  provenance: {
    mapping_version:
      typeof WGI_POLITICAL_STABILITY_MAPPING_VERSION;

    dataset:
      "Worldwide Governance Indicators";

    methodology:
      "WGI_2025_REVISION";

    source_api_id:
      "3";

    data_year:
      number;

    estimate:
      number;

    absolute_score:
      number;

    score_ci_lower:
      number;

    score_ci_upper:
      number;

    standard_error:
      number;

    source_count:
      number;

    methodology_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02";
  };

  rawPayload:
    WgiRawObservation[];

  qualityStatus:
    "VERIFIED";

  commercialEligibilityStatus:
    "VERIFIED";
};


export function mapWgiPoliticalStabilityToObservationInput(
  input: {
    bundle:
      WgiPoliticalStabilityBundle;

    raw_rows:
      WgiRawObservation[];

    source_url:
      string;
  },
): WgiObservationInput {
  return {
    sourceId:
      input.bundle.source_id,

    sourceRecordId:
      `2025-revision:${input.bundle.country_iso3}:${input.bundle.data_year}`,

    category:
      "GEOPOLITICS",

    countryIso3:
      input.bundle.country_iso3,

    partnerCountryIso3:
      null,

    observedAt:
      input.bundle.observed_at,

    publishedAt:
      input.bundle.observed_at,

    metric:
      "political_stability_absolute_score",

    valueNumeric:
      input.bundle.absolute_score,

    valueText:
      null,

    unit:
      "score_0_100",

    commodity:
      null,

    eventType:
      null,

    signalType:
      "political_instability_structural",

    sourceUrl:
      input.source_url,

    provenance: {
      mapping_version:
        WGI_POLITICAL_STABILITY_MAPPING_VERSION,

      dataset:
        "Worldwide Governance Indicators",

      methodology:
        input.bundle.provenance.methodology,

      source_api_id:
        input.bundle.source_api_id,

      data_year:
        input.bundle.data_year,

      estimate:
        input.bundle.estimate,

      absolute_score:
        input.bundle.absolute_score,

      score_ci_lower:
        input.bundle.score_ci_lower,

      score_ci_upper:
        input.bundle.score_ci_upper,

      standard_error:
        input.bundle.standard_error,

      source_count:
        input.bundle.source_count,

      methodology_status:
        input.bundle.provenance.methodology_status,
    },

    rawPayload:
      input.raw_rows,

    qualityStatus:
      "VERIFIED",

    commercialEligibilityStatus:
      "VERIFIED",
  };
}
