import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const ROOT = resolve(process.env.GEOMACRO_PUBLIC_BUILD_DIR || ".output/public");
const ARTIFACT = "artifacts/public-build-security-scan.json";
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

const forbiddenFilePatterns = [
  /(?:^|\/)\.env(?:\.|$)/i,
  /(?:^|\/)\.git(?:\/|$)/i,
  /(?:^|\/)\.npmrc$/i,
  /(?:^|\/)\.yarnrc(?:\.yml)?$/i,
  /(?:^|\/)wrangler\.toml$/i,
  /(?:^|\/)supabase\/config\.toml$/i,
  /(?:^|\/)supabase\/migrations\//i,
  /(?:^|\/)server\//i,
  /(?:^|\/)src\//i,
  /(?:^|\/)package\.json$/i,
  /(?:^|\/)bun\.lock$/i,
  /(?:^|\/)tsconfig[^/]*\.json$/i,
  /\.(?:pem|key|p12|pfx|crt|cer)$/i,
  /\.map$/i,
];

const forbiddenTextMarkers = [
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEOMACRO_API_CREDENTIAL_PEPPER",
  "GEOMACRO_SECURITY_FINGERPRINT_PEPPER",
  "GEOMACRO_REAL_FUNDS_SECURITY_ACK",
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK",
  "COINBASE_X402_MAINNET_ACK",
  "CDP_API_KEY_SECRET",
  "GOATX402_API_KEY",
  "CIRCLE_GATEWAY_API_KEY",
  "-----BEGIN PRIVATE KEY-----",
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
];

const suspiciousSourceMarkers = [
  "consume_central_security_budget(",
  "requireRiskSupabase()",
  "createClient<Database>",
  "GEOMACRO_BACKUP_RESTORE_DRILL_ACK",
  "postgresql://postgres:",
];

const optionalSecretEnvNames = [
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEOMACRO_API_CREDENTIAL_PEPPER",
  "GEOMACRO_SECURITY_FINGERPRINT_PEPPER",
  "CDP_API_KEY_SECRET",
  "GOATX402_API_KEY",
  "CIRCLE_GATEWAY_API_KEY",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else if (entry.isFile()) out.push(absolute);
  }
  return out;
}

function isProbablyText(path, bytes) {
  const extension = extname(path).toLowerCase();
  if ([".html", ".htm", ".js", ".mjs", ".cjs", ".css", ".json", ".txt", ".xml", ".svg", ".webmanifest", ""].includes(extension)) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
    return !sample.includes(0);
  }
  return false;
}

if (!statSync(ROOT, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Public build directory not found: ${ROOT}`);
}

const files = walk(ROOT);
const findings = [];
let totalBytes = 0;
let textFilesScanned = 0;

const actualSecrets = optionalSecretEnvNames
  .map((name) => ({ name, value: String(process.env[name] ?? "").trim() }))
  .filter(({ value }) => value.length >= 16);

for (const absolute of files) {
  const rel = relative(ROOT, absolute).replaceAll("\\", "/");
  const bytes = readFileSync(absolute);
  totalBytes += bytes.length;

  for (const pattern of forbiddenFilePatterns) {
    if (pattern.test(rel)) {
      findings.push({
        severity: "critical",
        code: "FORBIDDEN_PUBLIC_FILE",
        path: rel,
        pattern: pattern.source,
      });
      break;
    }
  }

  if (!isProbablyText(rel, bytes) || bytes.length > MAX_TEXT_BYTES) continue;
  textFilesScanned += 1;
  const text = bytes.toString("utf8");
  const lower = text.toLowerCase();

  if (/sourceMappingURL\s*=/.test(text)) {
    findings.push({
      severity: "high",
      code: "PUBLIC_SOURCEMAP_REFERENCE",
      path: rel,
    });
  }

  for (const marker of forbiddenTextMarkers) {
    if (lower.includes(marker.toLowerCase())) {
      findings.push({
        severity: "critical",
        code: "SERVER_SECRET_IDENTIFIER_EXPOSED",
        path: rel,
        marker,
      });
    }
  }

  for (const marker of suspiciousSourceMarkers) {
    if (text.includes(marker)) {
      findings.push({
        severity: "high",
        code: "SERVER_SOURCE_MARKER_EXPOSED",
        path: rel,
        marker,
      });
    }
  }

  for (const { name, value } of actualSecrets) {
    if (text.includes(value)) {
      findings.push({
        severity: "critical",
        code: "ACTUAL_SECRET_VALUE_EXPOSED",
        path: rel,
        secret_name: name,
        secret_fingerprint: sha256(value).slice(0, 12),
      });
    }
  }
}

const evidence = {
  schema_version: "geomacro.public-build-security-scan.v1",
  generated_at: new Date().toISOString(),
  build_root: relative(process.cwd(), ROOT).replaceAll("\\", "/"),
  boundary: {
    scans_public_build_only: true,
    server_bundle_scanned_as_public: false,
    actual_secret_values_persisted: false,
    source_maps_forbidden: true,
  },
  inventory: {
    files: files.length,
    text_files_scanned: textFilesScanned,
    total_bytes: totalBytes,
  },
  findings,
  result: findings.length === 0 ? "PASS" : "FAIL",
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(ARTIFACT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));

if (findings.length > 0) {
  throw new Error(`Public build security scan found ${findings.length} exposure finding(s)`);
}
