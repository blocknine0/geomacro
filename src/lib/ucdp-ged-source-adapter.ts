import {
  transformUcdpGedRecord,
  type UcdpGedRawRecord,
  type UcdpGedTransformResult,
} from "./ucdp-ged-contract";


export const UCDP_GED_DATASET_VERSION =
  "26.1" as const;


export type UcdpGedInputTransport =
  | "API"
  | "BULK_DOWNLOAD";


export type UcdpGedSourceEnvelope = {
  transport:
    UcdpGedInputTransport;

  dataset_version:
    typeof UCDP_GED_DATASET_VERSION;

  retrieved_at:
    string;

  source_url:
    string;

  licence:
    "CC BY 4.0";
};


export type CountryResolver = (
  countryName: string,
) => string | null;


export function transformUcdpGedBatch(
  input: {
    rows:
      UcdpGedRawRecord[];

    resolveCountryIso3:
      CountryResolver;

    source:
      UcdpGedSourceEnvelope;
  },
) {
  const accepted:
    Array<{
      source:
        UcdpGedSourceEnvelope;

      normalized:
        Extract<
          UcdpGedTransformResult,
          {
            status:
              "ACCEPTED";
          }
        >["normalized"];

      raw:
        UcdpGedRawRecord;
    }> = [];

  const rejected:
    Array<{
      source_record_id:
        string;

      country:
        string;

      reason:
        string;
    }> = [];


  for (
    const row of
    input.rows
  ) {
    const countryIso3 =
      input.resolveCountryIso3(
        row.country,
      );

    const result =
      transformUcdpGedRecord({
        raw:
          row,

        country_iso3:
          countryIso3,
      });


    if (
      result.status ===
      "ACCEPTED"
    ) {
      accepted.push({
        source:
          input.source,

        normalized:
          result.normalized,

        raw:
          row,
      });

      continue;
    }


    rejected.push({
      source_record_id:
        String(
          row.id,
        ),

      country:
        row.country,

      reason:
        result.reason,
    });
  }


  return {
    accepted,
    rejected,

    summary: {
      input_rows:
        input.rows.length,

      accepted_rows:
        accepted.length,

      rejected_rows:
        rejected.length,
    },
  };
}
