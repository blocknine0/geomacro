import {
  transformUcdpGedBatch,
} from "../src/lib/ucdp-ged-source-adapter";


const countryMap =
  new Map([
    [
      "India",
      "IND",
    ],
    [
      "Brazil",
      "BRA",
    ],
  ]);


const result =
  transformUcdpGedBatch({
    source: {
      transport:
        "API",

      dataset_version:
        "26.1",

      retrieved_at:
        "2026-09-06T00:00:00.000Z",

      source_url:
        "https://ucdpapi.pcr.uu.se/api/gedevents/26.1",

      licence:
        "CC BY 4.0",
    },

    resolveCountryIso3:
      country =>
        countryMap.get(
          country,
        ) ??
        null,

    rows: [
      {
        id:
          1,

        date_start:
          "2025-01-01",

        date_end:
          "2025-01-02",

        country:
          "India",

        best:
          4,
      },

      {
        id:
          2,

        date_start:
          "2025-02-01",

        date_end:
          "2025-02-03",

        country:
          "Brazil",

        best:
          2,
      },

      {
        id:
          3,

        date_start:
          "2025-03-01",

        date_end:
          "2025-03-02",

        country:
          "Unknownland",

        best:
          5,
      },
    ],
  });


if (
  result.summary.input_rows !==
    3 ||
  result.summary.accepted_rows !==
    2 ||
  result.summary.rejected_rows !==
    1
) {
  throw new Error(
    "Unexpected UCDP batch transformation counts",
  );
}


if (
  result.accepted[0]
    .source
    .dataset_version !==
  "26.1"
) {
  throw new Error(
    "Dataset version provenance lost",
  );
}


if (
  result.rejected[0]
    .reason !==
  "country_unmapped_or_invalid"
) {
  throw new Error(
    "Unmapped country rejection reason mismatch",
  );
}


console.log(
  result.summary,
);

console.log(
  result.rejected,
);

console.log(
  "PASS: UCDP API/BULK INPUT CAN SHARE ONE TRANSFORMATION PATH",
);

console.log(
  "PASS: DATASET VERSION + LICENCE PROVENANCE PRESERVED",
);

console.log(
  "PASS: UNMAPPED COUNTRIES FAIL CLOSED AT BATCH LEVEL",
);
