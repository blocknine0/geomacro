import fs from "node:fs/promises";
import process from "node:process";

import {
  transformUcdpGedBatch,
  UCDP_GED_DATASET_VERSION,
} from "../src/lib/ucdp-ged-source-adapter";

import {
  mapUcdpGedToObservationInput,
} from "../src/lib/ucdp-ged-observation-mapper";

import type {
  UcdpGedRawRecord,
} from "../src/lib/ucdp-ged-contract";

import {
  buildObservation,
} from "./lib-live-source-utils.mjs";


function argumentValue(
  flag: string,
): string | null {
  const index =
    process.argv.indexOf(
      flag,
    );

  if (
    index < 0 ||
    index + 1 >=
      process.argv.length
  ) {
    return null;
  }

  return (
    process.argv[
      index + 1
    ] ??
    null
  );
}


if (
  process.argv.includes(
    "--write",
  )
) {
  throw new Error(
    "--write is intentionally unsupported in Phase 3J-4C",
  );
}


const inputPath =
  argumentValue(
    "--input",
  );


if (!inputPath) {
  console.log({
    mode:
      "DRY_RUN",

    write_supported:
      false,

    dataset_version:
      UCDP_GED_DATASET_VERSION,

    usage:
      "npx tsx scripts/prepare-ucdp-ged-observations.ts --input <json-file>",
  });

  console.log(
    "PASS: DEFAULT MODE CANNOT WRITE TO DATABASE",
  );

  process.exit(0);
}


const rawText =
  await fs.readFile(
    inputPath,
    "utf8",
  );


const parsed:
  unknown =
  JSON.parse(
    rawText,
  );


let rows:
  UcdpGedRawRecord[];


if (Array.isArray(parsed)) {
  rows =
    parsed as
      UcdpGedRawRecord[];
} else if (
  parsed &&
  typeof parsed ===
    "object" &&
  Array.isArray(
    (
      parsed as {
        Result?: unknown;
      }
    ).Result,
  )
) {
  rows =
    (
      parsed as {
        Result:
          UcdpGedRawRecord[];
      }
    ).Result;
} else {
  throw new Error(
    "Input must be a raw UCDP row array or an API response containing Result[]",
  );
}


/*
 * Phase 3J-4C intentionally does not
 * guess country mappings.
 *
 * Until real UCDP response schema and
 * country mapping are verified with the
 * API token, only ISO3-looking country
 * values can self-resolve.
 */
const result =
  transformUcdpGedBatch({
    rows,

    source: {
      transport:
        "BULK_DOWNLOAD",

      dataset_version:
        UCDP_GED_DATASET_VERSION,

      retrieved_at:
        new Date()
          .toISOString(),

      source_url:
        `file://${inputPath}`,

      licence:
        "CC BY 4.0",
    },

    resolveCountryIso3:
      country => {
        const candidate =
          country
            .trim()
            .toUpperCase();

        return /^[A-Z]{3}$/.test(
          candidate,
        )
          ? candidate
          : null;
      },
  });


const observations =
  result.accepted.map(
    accepted => {
      const mapped =
        mapUcdpGedToObservationInput({
          normalized:
            accepted.normalized,

          raw:
            accepted.raw,

          source:
            accepted.source,
        });

      return buildObservation(
        mapped,
      );
    },
  );


console.log({
  mode:
    "DRY_RUN",

  write_supported:
    false,

  dataset_version:
    UCDP_GED_DATASET_VERSION,

  input_rows:
    result.summary
      .input_rows,

  accepted_rows:
    result.summary
      .accepted_rows,

  rejected_rows:
    result.summary
      .rejected_rows,

  prepared_observations:
    observations.length,
});


console.log(
  "REJECTED SAMPLE:",
  result.rejected.slice(
    0,
    10,
  ),
);


console.log(
  "OBSERVATION SAMPLE:",
  observations.slice(
    0,
    3,
  ).map(
    observation => ({
      observation_id:
        observation
          .observation_id,

      country_iso3:
        observation
          .country_iso3,

      metric:
        observation.metric,

      raw_hash:
        observation.raw_hash,

      normalized_hash:
        observation
          .normalized_hash,
    }),
  ),
);


console.log(
  "PASS: OBSERVATIONS PREPARED WITHOUT DATABASE WRITE",
);
