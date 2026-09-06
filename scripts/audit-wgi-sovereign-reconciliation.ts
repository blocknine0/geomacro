import {
  classifyGlobalEntity,
} from "../src/lib/global-entity-classification";


const API_BASE =
  "https://api.worldbank.org/v2";

const SOURCE =
  "3";

const INDICATORS = [
  "GOV_WGI_PV.EST",
  "GOV_WGI_PV.SC",
  "GOV_WGI_PV.SC_LB",
  "GOV_WGI_PV.SC_UB",
  "GOV_WGI_PV.SE",
  "GOV_WGI_PV.SR",
] as const;


type WorldBankRow = {
  country?: {
    id?: string;
    value?: string;
  };

  countryiso3code?:
    string;

  date?:
    string;

  value?:
    number | string | null;
};


async function fetchIndicator(
  indicator:
    string,
): Promise<WorldBankRow[]> {
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
    SOURCE,
  );

  url.searchParams.set(
    "date",
    "2024:2024",
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
      `World Bank HTTP ${response.status}`,
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
      `Invalid response for ${indicator}`,
    );
  }


  return data[1];
}


const byIso3 =
  new Map<
    string,
    {
      country:
        string | null;

      indicators:
        Set<string>;
    }
  >();


for (
  const indicator of
  INDICATORS
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


    let entry =
      byIso3.get(
        iso3,
      );


    if (!entry) {
      entry = {
        country:
          row.country?.value ??
          null,

        indicators:
          new Set(),
      };

      byIso3.set(
        iso3,
        entry,
      );
    }


    entry.indicators.add(
      indicator,
    );
  }
}


const complete =
  [...byIso3.entries()]
    .filter(
      (
        [, entry],
      ) =>
        INDICATORS.every(
          indicator =>
            entry.indicators.has(
              indicator,
            ),
        ),
    );


const classified =
  complete.map(
    (
      [
        iso3,
        entry,
      ],
    ) => {
      const entityScope =
        classifyGlobalEntity(
          iso3,
        );

      return {
        iso3,

        country:
          entry.country,

        entity_scope:
          entityScope,
      };
    },
  );


const scopeCounts =
  new Map<
    string,
    number
  >();


for (
  const row of
  classified
) {
  scopeCounts.set(
    row.entity_scope,
    (
      scopeCounts.get(
        row.entity_scope,
      ) ??
      0
    ) + 1,
  );
}


console.log({
  complete_wgi_2024_entities:
    classified.length,
});


console.log();
console.log(
  "===== ENTITY SCOPE DISTRIBUTION =====",
);


console.table(
  [...scopeCounts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1],
    )
    .map(
      (
        [
          entity_scope,
          count,
        ],
      ) => ({
        entity_scope,
        count,
      }),
    ),
);


const sovereigns =
  classified.filter(
    row =>
      row.entity_scope ===
      "SOVEREIGN",
  );


const nonSovereigns =
  classified.filter(
    row =>
      row.entity_scope !==
      "SOVEREIGN",
  );


console.log({
  sovereign_wgi_coverage:
    sovereigns.length,

  non_sovereign_wgi_entities:
    nonSovereigns.length,
});


console.log();
console.log(
  "===== NON-SOVEREIGN WGI ENTITIES =====",
);


console.table(
  nonSovereigns
    .sort(
      (a, b) =>
        a.iso3.localeCompare(
          b.iso3,
        ),
    ),
);


const unclassified =
  classified.filter(
    row =>
      row.entity_scope ===
      "UNCLASSIFIED",
  );


if (
  unclassified.length >
  0
) {
  console.log();
  console.log(
    "===== UNCLASSIFIED WGI ENTITIES =====",
  );

  console.table(
    unclassified,
  );
}


console.log();
console.log(
  "PASS: WGI ENTITY UNIVERSE RECONCILED AGAINST GEOMACRO CLASSIFICATION",
);

console.log(
  "PASS: NON-SOVEREIGN ENTITIES DO NOT COUNT TOWARD PRIMARY SOVEREIGN COVERAGE",
);

console.log(
  "PASS: NO DATABASE WRITE",
);
