import {
  buildWgiPoliticalStabilityBundle,
  WGI_POLITICAL_STABILITY_INDICATORS,
  type WgiRawObservation,
} from "../src/lib/wgi-political-stability-contract";

import {
  mapWgiPoliticalStabilityToObservationInput,
} from "../src/lib/wgi-political-stability-observation-mapper";

import {
  classifyGlobalEntity,
} from "../src/lib/global-entity-classification";

import {
  buildObservation,
} from "./lib-live-source-utils.mjs";


const API_BASE =
  "https://api.worldbank.org/v2";

const SOURCE_API_ID =
  "3";

const DATA_YEAR =
  "2024";


const indicators =
  Object.values(
    WGI_POLITICAL_STABILITY_INDICATORS,
  );


async function fetchIndicator(
  indicator:
    string,
): Promise<WgiRawObservation[]> {
  const url =
    new URL(
      `${API_BASE}/country/all/indicator/${indicator}`,
    );

  url.searchParams.set(
    "format",
    "json",
  );

  url.searchParams.set(
    "source",
    SOURCE_API_ID,
  );

  url.searchParams.set(
    "date",
    `${DATA_YEAR}:${DATA_YEAR}`,
  );

  url.searchParams.set(
    "per_page",
    "20000",
  );


  const response =
    await fetch(
      url,
      {
        headers: {
          accept:
            "application/json",
        },
      },
    );


  if (!response.ok) {
    throw new Error(
      `World Bank HTTP ${response.status} for ${indicator}`,
    );
  }


  const data =
    await response.json();


  if (
    !Array.isArray(
      data?.[1],
    )
  ) {
    throw new Error(
      `Invalid World Bank response for ${indicator}`,
    );
  }


  return data[1];
}


const rowsByIso3 =
  new Map<
    string,
    WgiRawObservation[]
  >();


for (
  const indicator of
  indicators
) {
  const rows =
    await fetchIndicator(
      indicator,
    );


  for (const row of rows) {
    const iso3 =
      row.countryiso3code
        ?.trim()
        .toUpperCase();


    if (
      !iso3 ||
      !/^[A-Z]{3}$/.test(
        iso3,
      ) ||
      row.value === null ||
      row.value === undefined
    ) {
      continue;
    }


    const existing =
      rowsByIso3.get(
        iso3,
      ) ?? [];


    existing.push(
      row,
    );


    rowsByIso3.set(
      iso3,
      existing,
    );
  }
}


const observations =
  [];

const rejected =
  [];

const excluded =
  [];


for (
  const [
    iso3,
    rawRows,
  ] of rowsByIso3
) {
  const entityScope =
    classifyGlobalEntity(
      iso3,
    );


  if (
    entityScope !==
    "SOVEREIGN"
  ) {
    excluded.push({
      iso3,
      entity_scope:
        entityScope,
    });

    continue;
  }


  const result =
    buildWgiPoliticalStabilityBundle(
      rawRows,
    );


  if (
    result.status !==
    "ACCEPTED"
  ) {
    rejected.push({
      iso3,
      result,
    });

    continue;
  }


  const mapped =
    mapWgiPoliticalStabilityToObservationInput({
      bundle:
        result.bundle,

      raw_rows:
        rawRows,

      source_url:
        "https://api.worldbank.org/v2/source/3",
    });


  observations.push(
    buildObservation(
      mapped,
    ),
  );
}


console.log({
  input_entities:
    rowsByIso3.size,

  prepared_sovereign_observations:
    observations.length,

  rejected_sovereign_bundles:
    rejected.length,

  excluded_non_sovereigns:
    excluded.length,

  mode:
    "DRY_RUN_NO_DATABASE_WRITE",
});


if (
  observations.length !==
  193
) {
  throw new Error(
    `Expected 193 sovereign WGI observations, got ${observations.length}`,
  );
}


if (
  rejected.length !==
  0
) {
  console.log(
    "REJECTED:",
    rejected,
  );

  throw new Error(
    "Unexpected rejected sovereign WGI bundles",
  );
}


const ids =
  new Set(
    observations.map(
      observation =>
        observation.observation_id,
    ),
  );


if (
  ids.size !==
  observations.length
) {
  throw new Error(
    "Duplicate WGI observation IDs detected",
  );
}


const hashes =
  new Set(
    observations.map(
      observation =>
        observation.normalized_hash,
    ),
  );


if (
  hashes.size !==
  observations.length
) {
  throw new Error(
    "Duplicate WGI normalized hashes detected",
  );
}


console.log();
console.log(
  "===== SAMPLE PREPARED OBSERVATIONS =====",
);


console.table(
  observations
    .filter(
      observation =>
        [
          "IND",
          "USA",
          "CHN",
          "BRA",
          "ZAF",
          "ARE",
          "SAU",
        ].includes(
          observation.country_iso3,
        ),
    )
    .map(
      observation => ({
        country_iso3:
          observation.country_iso3,

        metric:
          observation.metric,

        score:
          observation.value_numeric,

        observation_id:
          observation.observation_id,

        normalized_hash:
          observation.normalized_hash,
      }),
    ),
);


console.log();
console.log(
  "PASS: 193 SOVEREIGN WGI OBSERVATIONS PREPARED",
);

console.log(
  "PASS: NON-SOVEREIGN WGI ENTITIES EXCLUDED",
);

console.log(
  "PASS: OBSERVATION IDS + NORMALIZED HASHES UNIQUE",
);

console.log(
  "PASS: NO DATABASE WRITE",
);

console.log(
  "PASS: WGI REMAINS OUTSIDE GRO v0.2",
);
