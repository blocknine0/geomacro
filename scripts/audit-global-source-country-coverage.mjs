import {
  createClient,
} from "@supabase/supabase-js";


const db =
  createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    },
  );


async function fetchAll(
  table,
  select,
  pageSize = 1000,
) {
  const rows = [];

  let from = 0;

  while (true) {
    const {
      data,
      error,
    } =
      await db
        .from(table)
        .select(select)
        .range(
          from,
          from + pageSize - 1,
        );


    if (error) {
      throw new Error(
        `${table}: ${error.message}`,
      );
    }


    rows.push(
      ...(data ?? []),
    );


    if (
      !data ||
      data.length <
        pageSize
    ) {
      break;
    }


    from +=
      pageSize;
  }


  return rows;
}


console.log(
  "===== 1. COUNTRY REGISTRY =====",
);


const countries =
  await fetchAll(
    "live_country_registry",
    "*",
  );


console.log({
  registry_rows:
    countries.length,
});


const countryMap =
  new Map();


for (
  const row of countries
) {
  const iso3 =
    String(
      row.iso3 ??
      row.country_iso3 ??
      "",
    )
      .trim()
      .toUpperCase();


  if (!iso3) {
    continue;
  }


  countryMap.set(
    iso3,
    row,
  );
}


console.log({
  unique_registry_iso3:
    countryMap.size,
});


console.log(
  "===== 2. SOURCE REGISTRY =====",
);


const sources =
  await fetchAll(
    "live_external_sources",
    "*",
  );


console.table(
  sources.map(
    row => ({
      source_id:
        row.source_id,

      category:
        row.category,

      commercial:
        row.commercial_usage_status,

      ingestion:
        row.enabled_for_ingestion,

      signals:
        row.enabled_for_commercial_signals,
    }),
  ),
);


console.log(
  "===== 3. LIVE EXTERNAL OBSERVATIONS =====",
);


const observations =
  await fetchAll(
    "live_external_observations",
    "source_id,category,country_iso3,metric,commodity,observed_at",
  );


console.log({
  total_observations:
    observations.length,
});


const bySource =
  new Map();


const byCategory =
  new Map();


const observedCountries =
  new Set();


for (
  const row of observations
) {
  const iso3 =
    String(
      row.country_iso3 ??
      "",
    )
      .trim()
      .toUpperCase();


  if (iso3) {
    observedCountries.add(
      iso3,
    );
  }


  if (
    !bySource.has(
      row.source_id,
    )
  ) {
    bySource.set(
      row.source_id,
      {
        rows:
          0,

        countries:
          new Set(),

        metrics:
          new Set(),

        commodities:
          new Set(),

        latest:
          null,
      },
    );
  }


  const source =
    bySource.get(
      row.source_id,
    );


  source.rows += 1;


  if (iso3) {
    source
      .countries
      .add(
        iso3,
      );
  }


  if (row.metric) {
    source
      .metrics
      .add(
        row.metric,
      );
  }


  if (row.commodity) {
    source
      .commodities
      .add(
        row.commodity,
      );
  }


  if (
    row.observed_at &&
    (
      !source.latest ||
      row.observed_at >
        source.latest
    )
  ) {
    source.latest =
      row.observed_at;
  }


  if (
    !byCategory.has(
      row.category,
    )
  ) {
    byCategory.set(
      row.category,
      new Set(),
    );
  }


  if (iso3) {
    byCategory
      .get(
        row.category,
      )
      .add(
        iso3,
      );
  }
}


console.log(
  "\n===== BY SOURCE =====",
);


console.table(
  [...bySource.entries()]
    .map(
      (
        [
          source_id,
          value,
        ],
      ) => ({
        source_id,

        rows:
          value.rows,

        countries:
          value
            .countries
            .size,

        metrics:
          value
            .metrics
            .size,

        commodities:
          value
            .commodities
            .size,

        latest:
          value.latest,
      }),
    )
    .sort(
      (
        a,
        b,
      ) =>
        b.rows -
        a.rows,
    ),
);


console.log(
  "\n===== BY CATEGORY =====",
);


console.table(
  [...byCategory.entries()]
    .map(
      (
        [
          category,
          set,
        ],
      ) => ({
        category,

        countries:
          set.size,
      }),
    ),
);


console.log(
  "\n===== 4. COUNTRY COVERAGE MATRIX =====",
);


const categoryNames = [
  "MACRO",
  "GEOPOLITICS",
  "CRITICAL_MINERALS",
];


const sourceCountrySets =
  new Map();


for (
  const [
    sourceId,
    value,
  ] of bySource
) {
  sourceCountrySets.set(
    sourceId,
    value.countries,
  );
}


const matrix = [];


for (
  const iso3 of
    [...countryMap.keys()]
      .sort()
) {
  const macro =
    byCategory
      .get("MACRO")
      ?.has(
        iso3,
      ) ??
    false;


  const geo =
    byCategory
      .get("GEOPOLITICS")
      ?.has(
        iso3,
      ) ??
    false;


  const minerals =
    byCategory
      .get("CRITICAL_MINERALS")
      ?.has(
        iso3,
      ) ??
    false;


  matrix.push({
    iso3,

    macro,

    geopolitics:
      geo,

    critical_minerals:
      minerals,

    structured_categories:
      [
        macro,
        geo,
        minerals,
      ]
        .filter(Boolean)
        .length,
  });
}


console.table(
  matrix,
);


console.log(
  "\n===== 5. MISSING COVERAGE =====",
);


for (
  const category of
    categoryNames
) {
  const set =
    byCategory.get(
      category,
    ) ??
    new Set();


  const missing =
    [...countryMap.keys()]
      .filter(
        iso3 =>
          !set.has(
            iso3,
          ),
      )
      .sort();


  console.log({
    category,

    covered:
      set.size,

    missing:
      missing.length,

    missing_iso3:
      missing,
  });
}


console.log(
  "\n===== 6. MIDDLE EAST COVERAGE =====",
);


const middleEast = [
  "BHR",
  "EGY",
  "IRN",
  "IRQ",
  "ISR",
  "JOR",
  "KWT",
  "LBN",
  "OMN",
  "PSE",
  "QAT",
  "SAU",
  "SYR",
  "TUR",
  "ARE",
  "YEM",
];


console.table(
  middleEast.map(
    iso3 => ({
      iso3,

      in_registry:
        countryMap.has(
          iso3,
        ),

      macro:
        byCategory
          .get("MACRO")
          ?.has(
            iso3,
          ) ??
        false,

      geopolitics:
        byCategory
          .get("GEOPOLITICS")
          ?.has(
            iso3,
          ) ??
        false,

      critical_minerals:
        byCategory
          .get("CRITICAL_MINERALS")
          ?.has(
            iso3,
          ) ??
        false,
    }),
  ),
);


console.log(
  "\n===== 7. BRA / ZAF =====",
);


for (
  const iso3 of [
    "BRA",
    "ZAF",
  ]
) {
  console.log({
    iso3,

    registry:
      countryMap.has(
        iso3,
      ),

    macro:
      byCategory
        .get("MACRO")
        ?.has(
          iso3,
        ) ??
      false,

    geopolitics:
      byCategory
        .get("GEOPOLITICS")
        ?.has(
          iso3,
        ) ??
      false,

    critical_minerals:
      byCategory
        .get("CRITICAL_MINERALS")
        ?.has(
          iso3,
        ) ??
      false,
  });
}


console.log(
  "\n===== 8. OBSERVATION COUNTRIES OUTSIDE REGISTRY =====",
);


const outside =
  [...observedCountries]
    .filter(
      iso3 =>
        !countryMap.has(
          iso3,
        ),
    )
    .sort();


console.log({
  outside_registry_count:
    outside.length,

  iso3:
    outside,
});


console.log(
  "\n==================================================",
);

console.log(
  " PASS: EXISTING GLOBAL SOURCE COVERAGE AUDIT COMPLETE",
);

console.log(
  " READ ONLY: NO DATABASE WRITE",
);

console.log(
  "==================================================",
);
