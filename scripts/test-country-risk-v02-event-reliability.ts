import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  buildEventReliability,
} from "../src/lib/country-risk-v02-event-reliability";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const countries = [
  ["IND", "India"],
  ["USA", "United States"],
  ["CHN", "China"],
  ["DEU", "Germany"],
  ["BRA", "Brazil"],
  ["ZAF", "South Africa"],
] as const;


const rows = [];


for (
  const [
    iso3,
    name,
  ] of countries
) {
  const run =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const reliability =
    buildEventReliability(
      run.context
        .base_object,
    );


  const replay =
    buildEventReliability(
      run.context
        .base_object,
    );


  if (
    reliability
      .calculation_hash !==
    replay
      .calculation_hash
  ) {
    throw new Error(
      `${iso3}: reliability replay mismatch`,
    );
  }


  rows.push({
    country:
      iso3,

    event_score:
      run.context
        .base_object
        .risk
        .score,

    event_count:
      reliability
        .event_count,

    drivers:
      reliability
        .driver_count,

    source_families:
      reliability
        .source_family_count,

    largest_driver:
      reliability
        .largest_driver_share,

    largest_event:
      reliability
        .largest_event_share,

    effective_drivers:
      reliability
        .effective_driver_count,

    effective_evidence:
      reliability
        .effective_evidence_count,

    confidence:
      reliability
        .confidence_factor,

    reliability:
      reliability
        .reliability_factor,

    status:
      reliability
        .status,

    warnings:
      reliability
        .warnings
        .join(","),

    hash:
      reliability
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });
}


console.log(
  "===== EVENT RELIABILITY AUDIT =====",
);

console.table(
  rows,
);


const china =
  rows.find(
    row =>
      row.country ===
      "CHN",
  );


if (!china) {
  throw new Error(
    "China reliability result missing",
  );
}


if (
  china.event_count !==
  1
) {
  throw new Error(
    `Expected China pilot evidence count 1, got ${china.event_count}`,
  );
}


if (
  !String(
    china.warnings,
  ).includes(
    "single_event_evidence",
  )
) {
  throw new Error(
    "China single-event concentration not flagged",
  );
}


for (
  const country of [
    "BRA",
    "ZAF",
  ]
) {
  const row =
    rows.find(
      item =>
        item.country ===
        country,
    );


  if (
    !row ||
    row.reliability !==
      0 ||
    row.status !==
      "INSUFFICIENT"
  ) {
    throw new Error(
      `${country}: unavailable event reliability semantics incorrect`,
    );
  }
}


console.log(
  "PASS: EVENT EVIDENCE SUFFICIENCY AUDIT CLEAN",
);

console.log(
  "PASS: SINGLE-EVENT CONCENTRATION EXPLICITLY FLAGGED",
);

console.log(
  "PASS: EVENT-MISSING COUNTRIES REMAIN INSUFFICIENT",
);
