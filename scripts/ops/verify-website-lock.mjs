import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONFIG_PATH = "config/website-lock.json";
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

if (!config.locked) {
  console.error("::error::Website lock is disabled. Refusing to treat this repository state as protected.");
  process.exit(1);
}

const baseline = String(config.baseline_sha || "").trim();
if (!/^[0-9a-f]{40}$/i.test(baseline)) {
  console.error("::error::config/website-lock.json contains an invalid baseline_sha.");
  process.exit(1);
}

/**
 * FINAL GLOBAL RISK PRESENTATION FREEZE
 *
 * This baseline is intentionally hard-coded instead of being read from the
 * mutable website baseline config. Updating the general website baseline must
 * never silently re-approve changes to the founder-finalized /global-risk UI.
 *
 * Data, publishers, archives and verified runtime reads may continue evolving;
 * only these customer-facing presentation files are permanently pinned here.
 */
const GLOBAL_RISK_FROZEN_BASELINE = "0270ab7876cabe372c246f76fbcf299ed1b0e1fc";
const GLOBAL_RISK_FROZEN_PATHS = [
  "src/routes/global-risk.tsx",
  "src/components/gri/global-risk-domain-indices.tsx",
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function requireCommit(commit, label) {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`]);
  } catch {
    console.error(`::error::${label} ${commit} is not available in this checkout. Use fetch-depth: 0.`);
    process.exit(1);
  }
}

requireCommit(baseline, "Website lock baseline");
requireCommit(GLOBAL_RISK_FROZEN_BASELINE, "Final Global Risk frozen baseline");

function lines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function globalRiskFrozenViolations() {
  const committed = lines(
    git([
      "diff",
      "--name-only",
      "--diff-filter=ACDMRTUXB",
      GLOBAL_RISK_FROZEN_BASELINE,
      "HEAD",
      "--",
      ...GLOBAL_RISK_FROZEN_PATHS,
    ]),
  );
  const working = lines(
    git(["diff", "--name-only", "--diff-filter=ACDMRTUXB", "HEAD", "--", ...GLOBAL_RISK_FROZEN_PATHS]),
  );
  const staged = lines(
    git(["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB", "--", ...GLOBAL_RISK_FROZEN_PATHS]),
  );
  return [...new Set([...committed, ...working, ...staged])];
}

const globalRiskViolations = globalRiskFrozenViolations();
if (globalRiskViolations.length > 0) {
  console.error("::error::GEOMACRO GLOBAL RISK FINAL LOCK VIOLATION");
  console.error(`Founder-finalized Global Risk baseline: ${GLOBAL_RISK_FROZEN_BASELINE}`);
  console.error("The following permanently frozen /global-risk presentation files changed:");
  for (const path of globalRiskViolations) console.error(` - ${path}`);
  console.error("");
  console.error("Other Geomacro work may continue, including verified data/runtime updates, but the finalized /global-risk presentation must remain byte-for-byte equivalent to its frozen baseline.");
  process.exit(1);
}

const protectedExact = new Set([
  "components.json",
  "styles.css",
  "vite.config.ts",
  "src/router.tsx",
  "src/styles.css",
]);

const protectedPrefixes = [
  "public/",
  "src/assets/",
  "src/components/",
  "src/content/",
  "src/hooks/",
];

// Lock infrastructure is governed by dedicated static invariants, not the
// published website content baseline. Baseline-locking the verifier/workflow
// itself would make ordinary security maintenance self-deadlocking.

function isProtectedWebsitePath(path) {
  if (protectedExact.has(path)) return true;
  if (protectedPrefixes.some((prefix) => path.startsWith(prefix))) return true;

  // UI routes are frozen. API/server route files are .ts and remain available
  // for backend development without changing the published presentation.
  if (path.startsWith("src/routes/") && path.endsWith(".tsx")) return true;

  return false;
}

const changed = new Set([
  ...lines(git(["diff", "--name-only", "--diff-filter=ACDMRTUXB", baseline, "HEAD"])),
  ...lines(git(["diff", "--name-only", "--diff-filter=ACDMRTUXB", "HEAD"])),
  ...lines(git(["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"])),
]);

const violations = [...changed].filter(isProtectedWebsitePath);

if (violations.length > 0) {
  console.error("::error::GEOMACRO WEBSITE LOCK VIOLATION");
  console.error(`Published website baseline: ${baseline}`);
  console.error("The following locked website files differ from the approved published baseline:");
  for (const path of violations) console.error(` - ${path}`);
  console.error("");
  console.error("Backend/API/data work may continue, but these presentation files cannot change while the website lock is active.");
  console.error("Intentional website changes require explicit founder approval and a dedicated website-unlock/baseline-update change.");
  process.exit(1);
}

console.log(`Final Global Risk presentation lock verified at ${GLOBAL_RISK_FROZEN_BASELINE}.`);
console.log(`Website lock verified. Published presentation still matches baseline ${baseline}.`);
