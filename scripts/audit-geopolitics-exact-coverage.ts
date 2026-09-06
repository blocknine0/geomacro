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
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );


async function fetchAll(
  table: string,
  select: string,
  filters: (
    query: any,
  ) => any,
) {
  const pageSize = 1000;

  const rows: any[] = [];

  for (
    let from = 0;
    ;
    from += pageSize
  ) {
    let query =
      db
        .from(table)
        .select(select)
        .range(
          from,
          from + pageSize - 1,
        );

    query =
      filters(query);

    const result =
      await query;

    if (result.error) {
      throw result.error;
    }

    const page =
      result.data ?? [];

    rows.push(...page);

    if (
      page.length <
      pageSize
    ) {
      break;
    }
  }

  return rows;
}


const observations =
  await fetchAll(
    "live_external_observations",
    `
      source_id,
      category,
      country_iso3,
      metric,
      observed_at,
      quality_status,
      commercial_eligibility_status
    `,
    query =>
      query
        .eq(
          "category",
          "GEOPOLITICS",
        )
        .eq(
          "quality_status",
          "VERIFIED",
        )
        .eq(
          "commercial_eligibility_status",
          "VERIFIED",
        ),
  );


const registry =
  await fetchAll(
    "live_country_registry",
    `
      iso3,
      country_name,
      enabled
    `,
    query =>
      query.eq(
        "enabled",
        true,
      ),
  );


const sovereignIso3 =
  new Set([
    "AFG","ALB","DZA","AND","AGO","ATG","ARG","ARM","AUS","AUT",
    "AZE","BHS","BHR","BGD","BRB","BLR","BEL","BLZ","BEN","BTN",
    "BOL","BIH","BWA","BRA","BRN","BGR","BFA","BDI","CPV","KHM",
    "CMR","CAN","CAF","TCD","CHL","CHN","COL","COM","COG","COD",
    "CRI","CIV","HRV","CUB","CYP","CZE","DNK","DJI","DMA","DOM",
    "ECU","EGY","SLV","GNQ","ERI","EST","SWZ","ETH","FJI","FIN",
    "FRA","GAB","GMB","GEO","DEU","GHA","GRC","GRD","GTM","GIN",
    "GNB","GUY","HTI","HND","HUN","ISL","IND","IDN","IRN","IRQ",
    "IRL","ISR","ITA","JAM","JPN","JOR","KAZ","KEN","KIR","PRK",
    "KOR","KWT","KGZ","LAO","LVA","LBN","LSO","LBR","LBY","LIE",
    "LTU","LUX","MDG","MWI","MYS","MDV","MLI","MLT","MHL","MRT",
    "MUS","MEX","FSM","MDA","MCO","MNG","MNE","MAR","MOZ","MMR",
    "NAM","NRU","NPL","NLD","NZL","NIC","NER","NGA","MKD","NOR",
    "OMN","PAK","PLW","PAN","PNG","PRY","PER","PHL","POL","PRT",
    "QAT","ROU","RUS","RWA","KNA","LCA","VCT","WSM","SMR","STP",
    "SAU","SEN","SRB","SYC","SLE","SGP","SVK","SVN","SLB","SOM",
    "ZAF","SSD","ESP","LKA","SDN","SUR","SWE","CHE","SYR","TJK",
    "TZA","THA","TLS","TGO","TON","TTO","TUN","TUR","TKM","TUV",
    "UGA","UKR","ARE","GBR","USA","URY","UZB","VUT","VAT","VEN",
    "VNM","YEM","ZMB","ZWE",
  ]);


const registrySovereigns =
  registry.filter(
    row =>
      sovereignIso3.has(
        String(
          row.iso3,
        ),
      ),
  );


const observedCountries =
  new Set(
    observations
      .map(
        row =>
          row.country_iso3,
      )
      .filter(Boolean),
  );


const coveredSovereigns =
  registrySovereigns.filter(
    row =>
      observedCountries.has(
        row.iso3,
      ),
  );


const missingSovereigns =
  registrySovereigns.filter(
    row =>
      !observedCountries.has(
        row.iso3,
      ),
  );


const sourceCounts =
  new Map<string, number>();

const metricCounts =
  new Map<string, number>();


for (const row of observations) {
  const source =
    String(
      row.source_id ??
      "UNKNOWN",
    );

  const metric =
    String(
      row.metric ??
      "UNKNOWN",
    );

  sourceCounts.set(
    source,
    (
      sourceCounts.get(source) ??
      0
    ) + 1,
  );

  metricCounts.set(
    metric,
    (
      metricCounts.get(metric) ??
      0
    ) + 1,
  );
}


console.log(
  "===== EXACT GEOPOLITICS COVERAGE =====",
);

console.log({
  verified_commercial_observations:
    observations.length,

  all_observed_entities:
    observedCountries.size,

  sovereign_denominator:
    registrySovereigns.length,

  sovereign_covered:
    coveredSovereigns.length,

  sovereign_missing:
    missingSovereigns.length,
});


console.log(
  "\n===== SOURCES =====",
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
        b.count - a.count,
    ),
);


console.log(
  "\n===== METRICS =====",
);

console.table(
  [...metricCounts.entries()]
    .map(
      ([metric, count]) => ({
        metric,
        count,
      }),
    )
    .sort(
      (a, b) =>
        b.count - a.count,
    ),
);


console.log(
  "\n===== COVERED SOVEREIGNS =====",
);

console.table(
  coveredSovereigns
    .map(
      row => ({
        iso3:
          row.iso3,

        country:
          row.country_name,
      }),
    )
    .sort(
      (a, b) =>
        a.iso3.localeCompare(
          b.iso3,
        ),
    ),
);


console.log(
  "\n===== MISSING SOVEREIGNS =====",
);

console.table(
  missingSovereigns
    .map(
      row => ({
        iso3:
          row.iso3,

        country:
          row.country_name,
      }),
    )
    .sort(
      (a, b) =>
        a.iso3.localeCompare(
          b.iso3,
        ),
    ),
);


console.log(
  "\nREAD ONLY: NO DATABASE WRITE",
);
