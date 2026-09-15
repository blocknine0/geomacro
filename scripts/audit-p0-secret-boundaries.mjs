import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";

const OUTPUT = "artifacts/p0-secret-boundary-audit.json";
const BROWSER_BUILD_ROOT = ".output/public";
const REQUIRE_BROWSER_BUILD = process.env.P0_REQUIRE_BROWSER_BUILD === "1";

const PRIVILEGED_IDENTIFIERS = [
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "HISTORICAL_SUPABASE_SERVICE_ROLE_KEY",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
  "WEBHOOK_SIGNING_PRIVATE_KEY_PKCS8_B64",
  "CDP_API_KEY_SECRET",
  "GOATX402_API_SECRET",
  "GOATX402_API_KEY",
  "GOATX402_PILOT_ACCESS_TOKEN",
  "RISK_GATE_PROOF_API_KEY",
  "LOVABLE_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "MISTRAL_API_KEY",
  "CEREBRAS_API_KEY",
  "GUARDIAN_API_KEY",
];

const TEXT_EXTENSIONS = new Set([
  "", ".cjs", ".css", ".html", ".js", ".jsx", ".json", ".md", ".mjs",
  ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const BROWSER_BUNDLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function isTextCandidate(path) {
  if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return false;
  try {
    return statSync(path).size <= 2 * 1024 * 1024;
  } catch {
    return false;
  }
}

function readText(path) {
  try {
    const value = readFileSync(path);
    if (value.includes(0)) return null;
    return value.toString("utf8");
  } catch {
    return null;
  }
}

function isServerBoundSource(path, text) {
  if (path.includes(".server.")) return true;
  if (path.endsWith(".functions.ts") || path.endsWith(".functions.tsx")) {
    return text.includes("createServerFn");
  }
  if (text.includes('from "@tanstack/react-start/server"') || text.includes("from '@tanstack/react-start/server'")) {
    return true;
  }
  return false;
}

function isPotentialBrowserSource(path, text) {
  if (isServerBoundSource(path, text)) return false;
  if (path.startsWith("public/")) return true;
  if (path.startsWith("src/components/")) return true;

  if (path.startsWith("src/lib/")) {
    return !path.includes("/__tests__/");
  }

  if (path.startsWith("src/routes/")) {
    const name = basename(path);
    return !name.startsWith("api.") && !path.includes("/api/") && /\.(?:ts|tsx|js|jsx)$/.test(path);
  }

  return false;
}

function isAllowedEnvTemplate(path) {
  const name = basename(path).toLowerCase();
  return name.endsWith(".example") || name.endsWith(".sample") || name.endsWith(".template");
}

function walk(root) {
  if (!existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort();
}

const files = trackedFiles();
const violations = [];
const browserSourceFiles = [];
let textFilesScanned = 0;

for (const path of files) {
  const name = basename(path).toLowerCase();

  if (name === ".env" || (name.startsWith(".env.") && !isAllowedEnvTemplate(path))) {
    violations.push({ type: "tracked_environment_file", path });
  }

  if (/\.(?:pem|p12|pfx)$/i.test(name) || /^(?:id_rsa|id_ed25519)$/i.test(name)) {
    violations.push({ type: "tracked_private_key_file", path });
  }

  if (!isTextCandidate(path)) continue;
  const text = readText(path);
  if (text === null) continue;
  textFilesScanned += 1;

  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    violations.push({ type: "embedded_private_key_material", path });
  }

  if (/\b(?:mnemonic|seed phrase)\b\s*[:=]\s*["'][a-z]+(?:\s+[a-z]+){11,23}["']/i.test(text)) {
    violations.push({ type: "embedded_seed_phrase", path });
  }

  const vitePrivileged = [
    ...text.matchAll(/\bVITE_[A-Z0-9_]*(?:SERVICE_ROLE|PRIVATE_KEY|SIGNING_PRIVATE|API_SECRET|ACCESS_TOKEN|PASSWORD|MNEMONIC|SEED)[A-Z0-9_]*/g),
  ].map((match) => match[0]);

  for (const identifier of new Set(vitePrivileged)) {
    violations.push({ type: "privileged_vite_identifier", path, identifier });
  }

  if (isPotentialBrowserSource(path, text)) {
    browserSourceFiles.push(path);
    for (const identifier of PRIVILEGED_IDENTIFIERS) {
      const processEnvReference = new RegExp(`\\bprocess\\.env\\.${identifier}\\b`);
      const importMetaReference = new RegExp(`\\bimport\\.meta\\.env\\.${identifier}\\b`);
      if (processEnvReference.test(text) || importMetaReference.test(text)) {
        violations.push({ type: "privileged_env_access_in_browser_source", path, identifier });
      }
    }
  }
}

const browserBundleFiles = walk(BROWSER_BUILD_ROOT).filter((path) =>
  BROWSER_BUNDLE_EXTENSIONS.has(extname(path).toLowerCase()),
);

if (REQUIRE_BROWSER_BUILD && browserBundleFiles.length === 0) {
  violations.push({
    type: "browser_build_missing",
    path: BROWSER_BUILD_ROOT,
  });
}

for (const path of browserBundleFiles) {
  const text = readText(path);
  if (text === null) continue;
  for (const identifier of PRIVILEGED_IDENTIFIERS) {
    if (text.includes(identifier)) {
      violations.push({
        type: "privileged_identifier_in_production_browser_bundle",
        path,
        identifier,
      });
    }
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    violations.push({ type: "private_key_material_in_production_browser_bundle", path });
  }
}

const canonicalViolations = violations
  .map((item) => JSON.stringify(item))
  .sort()
  .join("\n");

const report = {
  schema_version: "geomacro-p0-secret-boundary-audit-1.1",
  generated_at: new Date().toISOString(),
  scope: {
    tracked_files: files.length,
    text_files_scanned: textFilesScanned,
    potential_browser_source_files_scanned: browserSourceFiles.length,
    production_browser_bundle_root: BROWSER_BUILD_ROOT,
    production_browser_bundle_files_scanned: browserBundleFiles.length,
    production_browser_bundle_required: REQUIRE_BROWSER_BUILD,
    privileged_identifiers_checked: PRIVILEGED_IDENTIFIERS.length,
  },
  controls: {
    tracked_runtime_env_files_forbidden: true,
    tracked_private_key_files_forbidden: true,
    embedded_private_key_material_forbidden: true,
    embedded_seed_phrases_forbidden: true,
    privileged_vite_identifiers_forbidden: true,
    privileged_env_access_in_browser_source_forbidden: true,
    privileged_identifiers_in_production_browser_bundle_forbidden: true,
  },
  result: violations.length === 0 ? "PASS" : "FAIL",
  violation_count: violations.length,
  violations,
  evidence_hash: sha256(canonicalViolations || "PASS"),
  notes: [
    "TanStack createServerFn modules and modules importing @tanstack/react-start/server are treated as server-bound source; the compiled .output/public bundle is scanned independently to verify that privileged identifiers did not cross the browser boundary.",
  ],
  limitations: [
    "This is a repository and compiled-browser-boundary control, not a credential-provider breach scan.",
    "It does not prove that a secret was never exposed in deleted Git history or external systems.",
    "Independent external security review remains a separate release gate.",
  ],
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (violations.length > 0) {
  process.exit(2);
}
