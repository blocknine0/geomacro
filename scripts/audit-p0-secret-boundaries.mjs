import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";

const OUTPUT = "artifacts/p0-secret-boundary-audit.json";

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

function isBrowserExposedPath(path) {
  if (path.startsWith("public/")) return true;
  if (path.startsWith("src/components/")) return true;

  if (path.startsWith("src/lib/")) {
    return !path.includes(".server.") && !path.includes("/__tests__/");
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

const files = trackedFiles();
const violations = [];
const browserFiles = [];
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

  if (isBrowserExposedPath(path)) {
    browserFiles.push(path);
    for (const identifier of PRIVILEGED_IDENTIFIERS) {
      if (text.includes(identifier)) {
        violations.push({ type: "privileged_identifier_in_browser_path", path, identifier });
      }
    }
  }
}

const canonicalViolations = violations
  .map((item) => JSON.stringify(item))
  .sort()
  .join("\n");

const report = {
  schema_version: "geomacro-p0-secret-boundary-audit-1.0",
  generated_at: new Date().toISOString(),
  scope: {
    tracked_files: files.length,
    text_files_scanned: textFilesScanned,
    browser_exposed_files_scanned: browserFiles.length,
    privileged_identifiers_checked: PRIVILEGED_IDENTIFIERS.length,
  },
  controls: {
    tracked_runtime_env_files_forbidden: true,
    tracked_private_key_files_forbidden: true,
    embedded_private_key_material_forbidden: true,
    embedded_seed_phrases_forbidden: true,
    privileged_vite_identifiers_forbidden: true,
    privileged_identifiers_in_browser_paths_forbidden: true,
  },
  result: violations.length === 0 ? "PASS" : "FAIL",
  violation_count: violations.length,
  violations,
  evidence_hash: sha256(canonicalViolations || "PASS"),
  limitations: [
    "This is a repository and browser-boundary control, not a credential-provider breach scan.",
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
