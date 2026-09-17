import { spawnSync } from "node:child_process";
import fs from "node:fs";

const implementation =
  "scripts/patch-live-structure-private-error-serializer.mjs";
const target =
  "supabase/functions/live-structure-intelligence/index.ts";

const result = spawnSync(
  process.execPath,
  [implementation],
  {
    encoding: "utf8",
    stdio: "pipe",
  },
);

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

let source = fs.readFileSync(target, "utf8");

const invalidThrow = /throw\s*\n\s*canonicalStoryError;/g;
const invalidMatches = source.match(invalidThrow) ?? [];
const canonicalThrow = "throw canonicalStoryError;";

if (invalidMatches.length === 1) {
  source = source.replace(invalidThrow, canonicalThrow);
} else if (
  invalidMatches.length === 0 &&
  source.includes(canonicalThrow)
) {
  // The implementation may already contain the canonical syntax.
} else {
  throw new Error(
    `Expected exactly one known canonical-story throw form, found ${invalidMatches.length} newline forms and canonical=${source.includes(canonicalThrow)}.`,
  );
}

if (/\bthrow\s*\n/.test(source)) {
  throw new Error(
    "Generated live structuring runtime still contains a line break immediately after throw.",
  );
}

if (!source.includes('"canonical_story_lookup"')) {
  throw new Error(
    "Generated live structuring runtime is missing canonical story identity resolution.",
  );
}

fs.writeFileSync(target, source, "utf8");
console.log(
  "PASS: canonical live structuring runtime patch is bundler-safe.",
);
