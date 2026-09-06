import process from "node:process";

import {
  createClient,
} from "@supabase/supabase-js";


const url =
  process.env.SUPABASE_URL;

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


if (!url || !serviceKey) {
  throw new Error(
    "Supabase configuration missing",
  );
}


const db =
  createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    },
  );


const result =
  await db
    .from(
      "live_external_observations",
    )
    .select("*")
    .eq(
      "category",
      "GEOPOLITICS",
    );


if (result.error) {
  throw result.error;
}


const rows =
  result.data ?? [];


console.log(
  "===== GEOPOLITICS OBSERVATION COUNT =====",
);

console.log({
  observations:
    rows.length,

  countries:
    new Set(
      rows.map(
        row =>
          row.country_iso3,
      ),
    ).size,
});


console.log(
  "\n===== COLUMN INVENTORY =====",
);

console.log(
  rows.length > 0
    ? Object.keys(
        rows[0],
      )
    : [],
);


const sourceCounts =
  new Map<
    string,
    number
  >();


for (const row of rows) {
  const source =
    String(
      row.source_id ??
      row.source_key ??
      row.source ??
      "UNKNOWN",
    );

  sourceCounts.set(
    source,
    (
      sourceCounts.get(
        source,
      ) ?? 0
    ) + 1,
  );
}


console.log(
  "\n===== SOURCE DISTRIBUTION =====",
);

console.table(
  [...sourceCounts.entries()]
    .map(
      ([source, count]) => ({
        source,
        count,
      }),
    )
    .sort(
      (a, b) =>
        b.count -
        a.count,
    ),
);


console.log(
  "\n===== COUNTRY DISTRIBUTION =====",
);

const countryCounts =
  new Map<
    string,
    number
  >();


for (const row of rows) {
  const iso3 =
    String(
      row.country_iso3 ??
      "UNKNOWN",
    );

  countryCounts.set(
    iso3,
    (
      countryCounts.get(
        iso3,
      ) ?? 0
    ) + 1,
  );
}


console.table(
  [...countryCounts.entries()]
    .map(
      ([country, count]) => ({
        country,
        count,
      }),
    )
    .sort(
      (a, b) =>
        a.country.localeCompare(
          b.country,
        ),
    ),
);


function dateValue(
  row: Record<string, unknown>,
): string | null {
  const candidates = [
    row.observed_at,
    row.published_at,
    row.period_end,
    row.period_start,
    row.created_at,
    row.updated_at,
  ];

  for (
    const candidate of
    candidates
  ) {
    if (
      typeof candidate ===
        "string" &&
      candidate.length >
        0
    ) {
      return candidate;
    }
  }

  return null;
}


const dated =
  rows
    .map(
      row => ({
        country:
          row.country_iso3,

        source:
          row.source_id ??
          row.source_key ??
          row.source,

        date:
          dateValue(
            row,
          ),

        indicator:
          row.indicator_code ??
          row.metric_key ??
          row.series_key ??
          row.indicator ??
          null,

        value:
          row.value ??
          row.numeric_value ??
          row.normalized_value ??
          null,
      }),
    )
    .filter(
      row =>
        row.date,
    )
    .sort(
      (a, b) =>
        String(
          a.date,
        ).localeCompare(
          String(
            b.date,
          ),
        ),
    );


console.log(
  "\n===== OLDEST SAMPLE =====",
);

console.table(
  dated.slice(
    0,
    20,
  ),
);


console.log(
  "\n===== NEWEST SAMPLE =====",
);

console.table(
  dated.slice(
    -20,
  ).reverse(),
);


console.log(
  "\n===== RAW SHAPE SAMPLE =====",
);

console.dir(
  rows.slice(
    0,
    5,
  ),
  {
    depth:
      4,

    maxArrayLength:
      20,
  },
);


console.log(
  "\nREAD ONLY: NO DATABASE WRITE",
);
