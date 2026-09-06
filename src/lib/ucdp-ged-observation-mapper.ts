import type {
  UcdpGedRawRecord,
  UcdpGedNormalizedRecord,
} from "./ucdp-ged-contract";

import type {
  UcdpGedSourceEnvelope,
} from "./ucdp-ged-source-adapter";


export const UCDP_GED_OBSERVATION_MAPPING_VERSION =
  "ucdp-ged-observation-mapping-v0.1.0" as const;


export type UcdpBuildObservationInput = {
  sourceId:
    "ucdp_ged";

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
    null;

  metric:
    "conflict_event_best_estimate_deaths";

  valueNumeric:
    number;

  valueText:
    null;

  unit:
    "deaths";

  commodity:
    null;

  eventType:
    "organized_violence_event";

  signalType:
    "conflict_exposure";

  sourceUrl:
    string;

  provenance: {
    mapping_version:
      typeof UCDP_GED_OBSERVATION_MAPPING_VERSION;

    dataset:
      "UCDP Georeferenced Event Dataset";

    dataset_version:
      string;

    transport:
      "API" | "BULK_DOWNLOAD";

    licence:
      "CC BY 4.0";

    retrieved_at:
      string;

    ucdp_event_id:
      string;

    conflict_id:
      string | null;

    dyad_id:
      string | null;

    type_of_violence:
      string | null;

    date_start:
      string;

    date_end:
      string;

    deaths_low:
      number | null;

    deaths_high:
      number | null;

    deaths_civilians:
      number | null;

    deaths_unknown:
      number | null;

    latitude:
      number | null;

    longitude:
      number | null;

    methodology_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02";
  };

  rawPayload:
    UcdpGedRawRecord;

  qualityStatus:
    "VERIFIED";

  commercialEligibilityStatus:
    "VERIFIED";
};


export function mapUcdpGedToObservationInput(
  input: {
    normalized:
      UcdpGedNormalizedRecord;

    raw:
      UcdpGedRawRecord;

    source:
      UcdpGedSourceEnvelope;
  },
): UcdpBuildObservationInput {
  return {
    sourceId:
      input.normalized.source_id,

    sourceRecordId:
      input.normalized.source_record_id,

    category:
      "GEOPOLITICS",

    countryIso3:
      input.normalized.country_iso3,

    partnerCountryIso3:
      null,

    observedAt:
      input.normalized.observed_at,

    publishedAt:
      null,

    metric:
      input.normalized.metric,

    valueNumeric:
      input.normalized.value_numeric,

    valueText:
      null,

    unit:
      input.normalized.unit,

    commodity:
      null,

    eventType:
      input.normalized.event_type,

    signalType:
      input.normalized.signal_type,

    sourceUrl:
      input.source.source_url,

    provenance: {
      mapping_version:
        UCDP_GED_OBSERVATION_MAPPING_VERSION,

      dataset:
        "UCDP Georeferenced Event Dataset",

      dataset_version:
        input.source.dataset_version,

      transport:
        input.source.transport,

      licence:
        input.source.licence,

      retrieved_at:
        input.source.retrieved_at,

      ...input.normalized.provenance,
    },

    rawPayload:
      input.raw,

    qualityStatus:
      "VERIFIED",

    commercialEligibilityStatus:
      "VERIFIED",
  };
}
