import process from "node:process";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  classifyGlobalEntity,
} from "../src/lib/global-entity-classification";


const url =
  process.env.SUPABASE_URL;

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Supabase service-role configuration missing",
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


const registryResult =
  await db
    .from(
      "live_country_registry",
    )
    .select(
      "iso3,country_name,enabled",
    )
    .eq(
      "enabled",
      true,
    )
    .order(
      "iso3",
      {
        ascending:
          true,
      },
    );


if (registryResult.error) {
  throw registryResult.error;
}


const registry =
  registryResult.data ?? [];


const classified =
  registry.map(
    row => ({
      iso3:
        row.iso3,

      country_name:
        row.country_name,

      entity_scope:
        classifyGlobalEntity(
          row.iso3,
        ),
    }),
  );


const counts = {
  total:
    classified.length,

  SOVEREIGN:
    0,

  TERRITORY:
    0,

  SPECIAL_ENTITY:
    0,

  UNCLASSIFIED:
    0,
};


for (
  const row of
  classified
) {
  counts[
    row.entity_scope
  ] += 1;
}


console.log(
  "===== ENTITY COUNTS =====",
);

console.log(
  counts,
);


console.log(
  "\n===== SPECIAL ENTITIES =====",
);

console.table(
  classified.filter(
    row =>
      row.entity_scope ===
      "SPECIAL_ENTITY",
  ),
);


console.log(
  "\n===== UNCLASSIFIED =====",
);

console.table(
  classified.filter(
    row =>
      row.entity_scope ===
      "UNCLASSIFIED",
  ),
);


const observationsResult =
  await db
    .from(
      "live_external_observations",
    )
    .select(
      "country_iso3,category",
    );


if (observationsResult.error) {
  throw observationsResult.error;
}


const availability =
  new Map<
    string,
    Set<string>
  >();


for (
  const observation of
  observationsResult.data ?? []
) {
  const iso3 =
    observation.country_iso3;

  const category =
    observation.category;

  if (
    typeof iso3 !== "string" ||
    typeof category !== "string"
  ) {
    continue;
  }

  if (!availability.has(iso3)) {
    availability.set(
      iso3,
      new Set(),
    );
  }

  availability
    .get(iso3)!
    .add(category);
}


const sovereignRows =
  classified
    .filter(
      row =>
        row.entity_scope ===
        "SOVEREIGN",
    )
    .map(
      row => {
        const categories =
          availability.get(
            row.iso3,
          ) ??
          new Set<string>();

        return {
          iso3:
            row.iso3,

          country:
            row.country_name,

          macro:
            categories.has(
              "MACRO",
            ),

          geopolitics:
            categories.has(
              "GEOPOLITICS",
            ),

          critical_minerals:
            categories.has(
              "CRITICAL_MINERALS",
            ),
        };
      },
    );


const sovereignCount =
  sovereignRows.length;


const macroCovered =
  sovereignRows.filter(
    row =>
      row.macro,
  ).length;


const geopoliticsCovered =
  sovereignRows.filter(
    row =>
      row.geopolitics,
  ).length;


console.log(
  "\n===== PRIMARY SOVEREIGN DENOMINATOR =====",
);

console.log({
  sovereign_denominator:
    sovereignCount,

  macro_covered:
    macroCovered,

  macro_missing:
    sovereignCount -
    macroCovered,

  geopolitics_covered:
    geopoliticsCovered,

  geopolitics_missing:
    sovereignCount -
    geopoliticsCovered,
});


console.log(
  "\n===== SOVEREIGN MACRO GAPS =====",
);

console.table(
  sovereignRows.filter(
    row =>
      !row.macro,
  ),
);


console.log(
  "\n===== SOVEREIGN GEOPOLITICS COVERED =====",
);

console.table(
  sovereignRows.filter(
    row =>
      row.geopolitics,
  ),
);


console.log(
  "\n===== SOVEREIGN GEOPOLITICS GAPS =====",
);

console.table(
  sovereignRows.filter(
    row =>
      !row.geopolitics,
  ),
);


console.log(
  "\n===== MIDDLE EAST SOVEREIGN CHECK =====",
);

const middleEast =
  new Set([
    "BHR",
    "EGY",
    "IRN",
    "IRQ",
    "ISR",
    "JOR",
    "KWT",
    "LBN",
    "OMN",
    "QAT",
    "SAU",
    "SYR",
    "TUR",
    "ARE",
    "YEM",
  ]);


console.table(
  sovereignRows.filter(
    row =>
      middleEast.has(
        row.iso3,
      ),
  ),
);


if (
  counts.UNCLASSIFIED >
  0
) {
  throw new Error(
    `Registry contains ${counts.UNCLASSIFIED} unclassified entities`,
  );
}


console.log(
  "PASS: ALL ENABLED REGISTRY ENTITIES CLASSIFIED",
);

console.log(
  "PASS: PRIMARY SOVEREIGN DENOMINATOR COMPUTED",
);

console.log(
  "PASS: TERRITORIES / SPECIAL ENTITIES EXCLUDED FROM PRIMARY DENOMINATOR",
);

console.log(
  "READ ONLY: NO DATABASE WRITE",
);
