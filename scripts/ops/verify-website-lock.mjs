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

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

try {
  git(["cat-file", "-e", `${baseline}^{commit}`]);
} catch {
  console.error(`::error::Website lock baseline ${baseline} is not available in this checkout. Use fetch-depth: 0.`);
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

function lines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

console.log(`Website lock verified. Published presentation still matches baseline ${baseline}.`);
