export const UCDP_GED_CONTRACT_VERSION =
  "ucdp-ged-contract-v0.1.0" as const;

export const UCDP_GED_SOURCE_ID =
  "ucdp_ged" as const;

export type UcdpGedRawRecord = {
  id:
    number | string;

  date_start:
    string;

  date_end:
    string;

  country:
    string;

  country_id?:
    number | string | null;

  conflict_new_id?:
    number | string | null;

  dyad_new_id?:
    number | string | null;

  type_of_violence?:
    number | string | null;

  deaths_a?:
    number | string | null;

  deaths_b?:
    number | string | null;

  deaths_civilians?:
    number | string | null;

  deaths_unknown?:
    number | string | null;

  best?:
    number | string | null;

  high?:
    number | string | null;

  low?:
    number | string | null;

  latitude?:
    number | string | null;

  longitude?:
    number | string | null;
};

export type UcdpGedNormalizedRecord = {
  contract_version:
    typeof UCDP_GED_CONTRACT_VERSION;

  source_id:
    typeof UCDP_GED_SOURCE_ID;

  source_record_id:
    string;

  country_iso3:
    string;

  partner_country_iso3:
    null;

  observed_at:
    string;

  published_at:
    null;

  metric:
    "conflict_event_best_estimate_deaths";

  value_numeric:
    number;

  unit:
    "deaths";

  event_type:
    "organized_violence_event";

  signal_type:
    "conflict_exposure";

  provenance: {
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
};


export type UcdpGedTransformResult =
  | {
      status:
        "ACCEPTED";

      normalized:
        UcdpGedNormalizedRecord;
    }
  | {
      status:
        "REJECTED";

      reason:
        string;
    };


function numberOrNull(
  value:
    unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric =
    Number(value);

  return Number.isFinite(
    numeric,
  )
    ? numeric
    : null;
}


function nonNegativeNumberOrNull(
  value:
    unknown,
): number | null {
  const numeric =
    numberOrNull(
      value,
    );

  if (
    numeric === null ||
    numeric < 0
  ) {
    return null;
  }

  return numeric;
}


function normalizeIso3(
  value:
    string,
): string | null {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z]{3}$/.test(
    iso3,
  )
    ? iso3
    : null;
}


function normalizeDate(
  value:
    string,
): string | null {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date.toISOString();
}


export function transformUcdpGedRecord(
  input: {
    raw:
      UcdpGedRawRecord;

    country_iso3:
      string | null;
  },
): UcdpGedTransformResult {
  const iso3 =
    input.country_iso3
      ? normalizeIso3(
          input.country_iso3,
        )
      : null;

  if (!iso3) {
    return {
      status:
        "REJECTED",

      reason:
        "country_unmapped_or_invalid",
    };
  }


  const observedAt =
    normalizeDate(
      input.raw.date_end,
    );

  const startAt =
    normalizeDate(
      input.raw.date_start,
    );

  if (
    !observedAt ||
    !startAt
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_event_date",
    };
  }


  if (
    new Date(startAt).getTime() >
    new Date(observedAt).getTime()
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "event_start_after_end",
    };
  }


  const best =
    nonNegativeNumberOrNull(
      input.raw.best,
    );

  if (best === null) {
    return {
      status:
        "REJECTED",

      reason:
        "missing_or_invalid_best_deaths",
    };
  }


  const eventId =
    String(
      input.raw.id,
    ).trim();

  if (!eventId) {
    return {
      status:
        "REJECTED",

      reason:
        "missing_source_record_id",
    };
  }


  return {
    status:
      "ACCEPTED",

    normalized: {
      contract_version:
        UCDP_GED_CONTRACT_VERSION,

      source_id:
        UCDP_GED_SOURCE_ID,

      source_record_id:
        eventId,

      country_iso3:
        iso3,

      partner_country_iso3:
        null,

      observed_at:
        observedAt,

      published_at:
        null,

      metric:
        "conflict_event_best_estimate_deaths",

      value_numeric:
        best,

      unit:
        "deaths",

      event_type:
        "organized_violence_event",

      signal_type:
        "conflict_exposure",

      provenance: {
        ucdp_event_id:
          eventId,

        conflict_id:
          input.raw.conflict_new_id ===
            null ||
          input.raw.conflict_new_id ===
            undefined
            ? null
            : String(
                input.raw.conflict_new_id,
              ),

        dyad_id:
          input.raw.dyad_new_id ===
            null ||
          input.raw.dyad_new_id ===
            undefined
            ? null
            : String(
                input.raw.dyad_new_id,
              ),

        type_of_violence:
          input.raw.type_of_violence ===
            null ||
          input.raw.type_of_violence ===
            undefined
            ? null
            : String(
                input.raw.type_of_violence,
              ),

        date_start:
          startAt,

        date_end:
          observedAt,

        deaths_low:
          nonNegativeNumberOrNull(
            input.raw.low,
          ),

        deaths_high:
          nonNegativeNumberOrNull(
            input.raw.high,
          ),

        deaths_civilians:
          nonNegativeNumberOrNull(
            input.raw.deaths_civilians,
          ),

        deaths_unknown:
          nonNegativeNumberOrNull(
            input.raw.deaths_unknown,
          ),

        latitude:
          numberOrNull(
            input.raw.latitude,
          ),

        longitude:
          numberOrNull(
            input.raw.longitude,
          ),

        methodology_status:
          "EVIDENCE_ONLY_NOT_IN_GRO_V02",
      },
    },
  };
}
