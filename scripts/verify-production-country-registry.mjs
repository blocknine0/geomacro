import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DB_URL = process.env.SUPABASE_DB_URL?.trim();
if (!DB_URL) {
  throw new Error("SUPABASE_DB_URL is required");
}

const classificationPath = new URL(
  "../src/lib/global-entity-classification.ts",
  import.meta.url,
);

const source = readFileSync(classificationPath, "utf8");

function parseSet(name) {
  const startMarker = `const ${name} = new Set([`;
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`${name} declaration not found`);
  }
  const end = source.indexOf("]);", start);
  if (end < 0) {
    throw new Error(`${name} declaration end not found`);
  }
  return [
    ...source
      .slice(start, end)
      .matchAll(/"([A-Z]{3})"/g),
  ].map((match) => match[1]);
}

const sovereign = parseSet("SOVEREIGN_ISO3");
const territory = parseSet("TERRITORY_ISO3");
const special = parseSet("SPECIAL_ENTITY_ISO3");
const canonical = new Set([
  ...sovereign,
  ...territory,
  ...special,
]);

if (sovereign.length !== 194) {
  throw new Error(`Canonical sovereign set drifted: expected 194, found ${sovereign.length}`);
}
if (territory.length !== 53) {
  throw new Error(`Canonical territory set drifted: expected 53, found ${territory.length}`);
}
if (special.length !== 3) {
  throw new Error(`Canonical special-entity set drifted: expected 3, found ${special.length}`);
}
if (canonical.size !== 250) {
  throw new Error(`Canonical entity universe drifted: expected 250 unique ISO3 codes, found ${canonical.size}`);
}

const overlapSets = [
  ["sovereign", sovereign],
  ["territory", territory],
  ["special", special],
];
for (let i = 0; i < overlapSets.length; i += 1) {
  for (let j = i + 1; j < overlapSets.length; j += 1) {
    const [leftName, left] = overlapSets[i];
    const [rightName, right] = overlapSets[j];
    const overlap = left.filter((value) => right.includes(value));
    if (overlap.length) {
      throw new Error(
        `Canonical ISO3 classification overlap between ${leftName} and ${rightName}: ${overlap.join(",")}`,
      );
    }
  }
}

const dbOutput = execFileSync(
  "psql",
  [
    DB_URL,
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-X",
    "-c",
    "select iso3 from public.live_country_registry where enabled = true order by iso3;",
  ],
  {
    env: {
      ...process.env,
      PGSSLMODE: "require",
    },
    encoding: "utf8",
  },
);

const actual = dbOutput
  .split("\n")
  .map((value) => value.trim())
  .filter(Boolean);

const duplicateCheck = new Set(actual);
if (duplicateCheck.size !== actual.length) {
  throw new Error("Authoritative country registry returned duplicate ISO3 rows");
}

const actualSet = new Set(actual);
const missing = [...canonical].filter((iso3) => !actualSet.has(iso3)).sort();
const unexpected = [...actualSet].filter((iso3) => !canonical.has(iso3)).sort();

if (missing.length || unexpected.length || actual.length !== 250) {
  const details = [];
  if (actual.length !== 250) {
    details.push(`expected 250 enabled entities, found ${actual.length}`);
  }
  if (missing.length) details.push(`missing=${missing.join(",")}`);
  if (unexpected.length) details.push(`unexpected=${unexpected.join(",")}`);
  throw new Error(`Authoritative country registry drift: ${details.join("; ")}`);
}

const actualSovereign = actual.filter((iso3) => sovereign.includes(iso3)).length;
const actualTerritory = actual.filter((iso3) => territory.includes(iso3)).length;
const actualSpecial = actual.filter((iso3) => special.includes(iso3)).length;

if (actualSovereign !== 194 || actualTerritory !== 53 || actualSpecial !== 3) {
  throw new Error(
    `Authoritative classification counts drifted: sovereign=${actualSovereign}, territory=${actualTerritory}, special=${actualSpecial}`,
  );
}

console.log(
  "PASS: authoritative production country registry exactly matches the canonical 250-entity universe (194 sovereign + 53 territory + 3 special), including CHN and USA.",
);
