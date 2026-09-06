import {
  GEOPOLITICAL_SOURCE_EXPANSION,
  getCandidatesForDimension,
  getReadyStructuralSources,
} from "../src/lib/geopolitical-source-expansion";


const conflict =
  getCandidatesForDimension(
    "CONFLICT_EXPOSURE",
  );


if (
  !conflict.some(
    source =>
      source.source_key ===
        "ucdp_ged" &&
      source.implementation_status ===
        "READY_FOR_IMPLEMENTATION",
  )
) {
  throw new Error(
    "UCDP GED must be implementation-ready for conflict exposure",
  );
}


const instability =
  getCandidatesForDimension(
    "POLITICAL_INSTABILITY",
  );


if (
  !instability.some(
    source =>
      source.source_key ===
        "world_bank_wgi_political_stability",
  )
) {
  throw new Error(
    "Political instability requires WGI candidate",
  );
}


const sanctions =
  getCandidatesForDimension(
    "SANCTIONS_COERCION",
  );


if (
  sanctions.some(
    source =>
      source.implementation_status ===
        "READY_FOR_IMPLEMENTATION",
  )
) {
  throw new Error(
    "Sanctions sources must remain review-gated before implementation",
  );
}


const acled =
  GEOPOLITICAL_SOURCE_EXPANSION.find(
    source =>
      source.source_key ===
      "acled",
  );


if (
  !acled ||
  acled.implementation_status !==
    "DO_NOT_IMPLEMENT"
) {
  throw new Error(
    "ACLED must not become a default commercial dependency",
  );
}


const gdelt =
  GEOPOLITICAL_SOURCE_EXPANSION.find(
    source =>
      source.source_key ===
      "gdelt_gal",
  );


if (
  !gdelt ||
  gdelt.source_class !==
    "CURRENT_EVENT_FEED"
) {
  throw new Error(
    "GDELT GAL must remain current-event infrastructure",
  );
}


for (
  const source of
  GEOPOLITICAL_SOURCE_EXPANSION
) {
  if (
    source.raw_customer_redistribution !==
      false
  ) {
    throw new Error(
      `${source.source_key}: raw customer redistribution must remain disabled`,
    );
  }
}


const ready =
  getReadyStructuralSources();


console.table(
  GEOPOLITICAL_SOURCE_EXPANSION.map(
    source => ({
      source:
        source.source_key,

      dimension:
        source.dimension,

      class:
        source.source_class,

      commercial:
        source.commercial_status,

      implementation:
        source.implementation_status,

      role:
        source.expected_role,
    }),
  ),
);


console.log(
  "READY STRUCTURAL SOURCES:",
  ready.map(
    source =>
      source.source_key,
  ),
);


console.log(
  "PASS: UCDP CONFLICT EXPOSURE IS IMPLEMENTATION-READY",
);

console.log(
  "PASS: WGI POLITICAL STABILITY IS IMPLEMENTATION-READY",
);

console.log(
  "PASS: SANCTIONS SOURCES REMAIN REVIEW-GATED",
);

console.log(
  "PASS: GDELT REMAINS CURRENT-EVENT INFRASTRUCTURE",
);

console.log(
  "PASS: ACLED IS NOT A DEFAULT COMMERCIAL DEPENDENCY",
);

console.log(
  "PASS: RAW CUSTOMER REDISTRIBUTION IS DISABLED FOR ALL SOURCES",
);
