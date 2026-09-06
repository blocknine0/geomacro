import {
  classifyGlobalEntity,
} from "../src/lib/global-entity-classification";


const tests = [
  ["IND", "SOVEREIGN"],
  ["BRA", "SOVEREIGN"],
  ["ZAF", "SOVEREIGN"],
  ["ARE", "SOVEREIGN"],
  ["SAU", "SOVEREIGN"],

  ["GIB", "TERRITORY"],
  ["GGY", "TERRITORY"],
  ["PRI", "TERRITORY"],
  ["VIR", "TERRITORY"],
  ["ALA", "TERRITORY"],

  ["PSE", "SPECIAL_ENTITY"],
  ["TWN", "SPECIAL_ENTITY"],
  ["UNK", "SPECIAL_ENTITY"],
] as const;


for (const [iso3, expected] of tests) {
  const actual =
    classifyGlobalEntity(
      iso3,
    );

  if (actual !== expected) {
    throw new Error(
      `${iso3}: expected ${expected}, got ${actual}`,
    );
  }

  console.log({
    iso3,
    entity_scope:
      actual,
  });
}


console.log(
  "PASS: GLOBAL ENTITY CLASSIFICATION CONTRACT CLEAN",
);
