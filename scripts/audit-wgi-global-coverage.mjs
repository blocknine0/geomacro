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
];


async function getJson(
  url,
) {
  const response =
    await fetch(url, {
      headers: {
        accept:
          "application/json",
      },
    });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`,
    );
  }

  return response.json();
}


async function fetchIndicator(
  indicator,
) {
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
    "1996:2026",
  );

  url.searchParams.set(
    "per_page",
    "20000",
  );

  const data =
    await getJson(url);

  if (
    !Array.isArray(data?.[1])
  ) {
    throw new Error(
      `Invalid World Bank response for ${indicator}`,
    );
  }

  return data[1];
}


console.log({
  source:
    "Worldwide Governance Indicators",

  source_api_id:
    SOURCE,

  indicators:
    INDICATORS,

  mode:
    "READ_ONLY_GLOBAL_COVERAGE_AUDIT",
});


const datasets =
  new Map();


for (
  const indicator of
  INDICATORS
) {
  const rows =
    await fetchIndicator(
      indicator,
    );

  const usable =
    rows.filter(
      row =>
        typeof row
          ?.countryiso3code ===
          "string" &&
        /^[A-Z]{3}$/.test(
          row.countryiso3code,
        ) &&
        row.value !== null &&
        row.value !== undefined,
    );

  datasets.set(
    indicator,
    usable,
  );

  console.log({
    indicator,

    returned_rows:
      rows.length,

    usable_rows:
      usable.length,

    countries:
      new Set(
        usable.map(
          row =>
            row.countryiso3code,
        ),
      ).size,
  });
}


const byCountryYear =
  new Map();


for (
  const [
    indicator,
    rows,
  ] of datasets
) {
  for (const row of rows) {
    const iso3 =
      row.countryiso3code;

    const year =
      Number(
        row.date,
      );

    if (
      !Number.isInteger(year)
    ) {
      continue;
    }

    const key =
      `${iso3}:${year}`;

    let entry =
      byCountryYear.get(
        key,
      );

    if (!entry) {
      entry = {
        iso3,
        country:
          row.country?.value ??
          null,

        year,

        indicators:
          new Map(),
      };

      byCountryYear.set(
        key,
        entry,
      );
    }

    entry.indicators.set(
      indicator,
      row.value,
    );
  }
}


const complete =
  [];


for (
  const entry of
  byCountryYear.values()
) {
  if (
    INDICATORS.every(
      indicator =>
        entry.indicators.has(
          indicator,
        ),
    )
  ) {
    complete.push(
      entry,
    );
  }
}


const latestByCountry =
  new Map();


for (
  const entry of
  complete
) {
  const previous =
    latestByCountry.get(
      entry.iso3,
    );

  if (
    !previous ||
    entry.year >
      previous.year
  ) {
    latestByCountry.set(
      entry.iso3,
      entry,
    );
  }
}


const yearCounts =
  new Map();


for (
  const entry of
  latestByCountry.values()
) {
  yearCounts.set(
    entry.year,
    (
      yearCounts.get(
        entry.year,
      ) ??
      0
    ) + 1,
  );
}


console.log();
console.log(
  "===== COMPLETE COUNTRY-YEAR BUNDLES =====",
);

console.log({
  complete_country_year_bundles:
    complete.length,

  countries_with_complete_bundle:
    latestByCountry.size,
});


console.log();
console.log(
  "===== LATEST COMPLETE YEAR DISTRIBUTION =====",
);

console.table(
  [...yearCounts.entries()]
    .sort(
      (a, b) =>
        b[0] - a[0],
    )
    .map(
      ([year, countries]) => ({
        year,
        countries,
      }),
    ),
);


const latest2024 =
  [...latestByCountry.values()]
    .filter(
      entry =>
        entry.year ===
        2024,
    );


console.log({
  countries_with_latest_2024_bundle:
    latest2024.length,
});


const samples =
  [
    "IND",
    "USA",
    "CHN",
    "BRA",
    "ZAF",
    "ARE",
    "SAU",
    "DEU",
    "JPN",
    "RUS",
  ];


console.log();
console.log(
  "===== SAMPLE LATEST BUNDLES =====",
);


console.table(
  samples.map(
    iso3 => {
      const entry =
        latestByCountry.get(
          iso3,
        );

      return {
        iso3,

        country:
          entry?.country ??
          null,

        latest_complete_year:
          entry?.year ??
          null,

        estimate:
          entry
            ?.indicators
            .get(
              "GOV_WGI_PV.EST",
            ) ??
          null,

        score:
          entry
            ?.indicators
            .get(
              "GOV_WGI_PV.SC",
            ) ??
          null,

        source_count:
          entry
            ?.indicators
            .get(
              "GOV_WGI_PV.SR",
            ) ??
          null,
      };
    },
  ),
);


console.log();
console.log(
  "PASS: GLOBAL WGI COVERAGE AUDIT COMPLETE",
);

console.log(
  "PASS: ONLY COMPLETE SIX-INDICATOR COUNTRY-YEAR BUNDLES COUNTED",
);

console.log(
  "PASS: NO DATABASE WRITE",
);
