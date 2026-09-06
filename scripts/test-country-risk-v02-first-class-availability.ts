import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


for (
  const [
    iso3,
    name,
    expected,
  ] of [
    [
      "IND",
      "India",
      "FULL",
    ],
    [
      "BRA",
      "Brazil",
      "MACRO_ONLY",
    ],
    [
      "ZAF",
      "South Africa",
      "MACRO_ONLY",
    ],
  ] as const
) {
  const result =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const object =
    result.object;


  console.log({
    country:
      iso3,

    availability:
      object
        .availability,

    final_score:
      object
        .score
        .final_score,

    final_confidence:
      object
        .confidence
        .final_confidence,

    hash:
      object
        .integrity
        .calculation_hash,
  });


  if (
    object
      .availability
      .status !==
      expected
  ) {
    throw new Error(
      `${iso3}: expected ${expected}, got ${object.availability.status}`,
    );
  }


  if (
    !object
      .availability
      .composite_score_available &&
    object
      .score
      .final_score !==
      null
  ) {
    throw new Error(
      `${iso3}: unavailable composite emitted numeric score`,
    );
  }
}


console.log(
  "PASS: AVAILABILITY IS FIRST-CLASS IN GRO v0.2",
);

console.log(
  "PASS: AVAILABILITY PARTICIPATES IN CALCULATION HASH",
);
