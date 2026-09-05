import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


for (
  const [
    country_iso3,
    country_name,
  ] of [
    ["IND", "India"],
    ["BRA", "Brazil"],
    ["ZAF", "South Africa"],
  ] as const
) {
  const result =
    await dryRunCountryRiskV02({
      country_iso3,
      country_name,
      as_of:
        AS_OF,
    });


  const object =
    result.object;


  console.log({
    country:
      country_iso3,

    event_available:
      object
        .base_event_risk
        .available,

    event_score:
      object
        .base_event_risk
        .score,

    event_confidence:
      object
        .base_event_risk
        .confidence,

    exclusion:
      object
        .base_event_risk
        .exclusion_reason,

    macro_observed_risk:
      object
        .macro_component
        .weighted_observed_risk,

    macro_coverage:
      object
        .macro_component
        .coverage_ratio,

    event_contribution:
      object
        .score
        .event_contribution,

    macro_contribution:
      object
        .score
        .macro_contribution,

    final_score:
      object
        .score
        .final_score,

    final_confidence:
      object
        .confidence
        .final_confidence,
  });


  if (
    country_iso3 ===
      "IND"
  ) {
    if (
      !object
        .base_event_risk
        .available
    ) {
      throw new Error(
        "India event component unexpectedly unavailable",
      );
    }

    if (
      object
        .score
        .final_score ===
        null
    ) {
      throw new Error(
        "India integrated score unexpectedly null",
      );
    }
  }


  if (
    country_iso3 ===
      "BRA" ||
    country_iso3 ===
      "ZAF"
  ) {
    if (
      object
        .base_event_risk
        .available
    ) {
      throw new Error(
        `${country_iso3}: missing event evidence treated as measured`,
      );
    }

    if (
      object
        .base_event_risk
        .score !==
        null
    ) {
      throw new Error(
        `${country_iso3}: unavailable event score still numeric`,
      );
    }

    if (
      object
        .score
        .final_score !==
        null
    ) {
      throw new Error(
        `${country_iso3}: partial composite score still emitted`,
      );
    }

    if (
      object
        .confidence
        .final_confidence !==
        0
    ) {
      throw new Error(
        `${country_iso3}: unavailable composite has non-zero confidence`,
      );
    }
  }
}


console.log(
  "PASS: MISSING EVENT EVIDENCE != ZERO EVENT RISK",
);

console.log(
  "PASS: PARTIAL MACRO DATA CANNOT CREATE MISLEADING COMPOSITE",
);

console.log(
  "PASS: INDIA MEASURED EVENT PATH PRESERVED",
);
