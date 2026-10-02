import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";

import { apiCredentialDigest } from "../../src/lib/api-credential-hash.server";
import {
  COUNTRY_RISK_METHOD_VERSION,
  CORRIDOR_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  riskLabel,
  type GeomacroRiskObject,
} from "../../src/lib/risk-object-contract";
import { signRiskObject } from "../../src/lib/risk-object-signing.server";
import { persistRiskObject } from "../../src/lib/risk-object-store.server";
import { requireRiskSupabase } from "../../src/lib/risk-supabase.server";

const STAGING_BASE_URL = "http://127.0.0.1:3000";
const CLIENT_ID = "ephemeral-final-acceptance";

function fail(message: string): never {
  throw new Error(`[ephemeral-risk-gate-staging] ${message}`);
}

function requireLocalSupabase(): string {
  const raw = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  if (!raw) fail("APP_SUPABASE_URL or SUPABASE_URL is required");
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production") fail("NODE_ENV=production is forbidden");
  if (!(["127.0.0.1", "localhost", "::1"] as string[]).includes(url.hostname)) {
    fail(`non-loopback Supabase URL is forbidden: ${url.hostname}`);
  }
  if (String(process.env.GEOMACRO_SUPABASE_RUNTIME_MODE ?? "").trim() !== "primary") {
    fail("GEOMACRO_SUPABASE_RUNTIME_MODE=primary is required for disposable local staging");
  }
  return url.toString().replace(/\/$/, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function exportDerBase64(key: ReturnType<typeof generateKeyPairSync>["privateKey"] | ReturnType<typeof generateKeyPairSync>["publicKey"], type: "pkcs8" | "spki"): string {
  return Buffer.from(key.export({ format: "der", type } as never) as Buffer).toString("base64");
}

function unsignedCountry(
  iso3: "USA" | "CHN",
  name: string,
  score: number,
  previousScore: number,
  generatedAt: string,
  expiresAt: string,
): GeomacroRiskObject {
  const namespace = `ephemeral-staging:${iso3}:${generatedAt}`;
  const delta = score - previousScore;
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: `gro_ephemeral_${iso3.toLowerCase()}_${randomUUID()}`,
    subject: { type: "country", id: iso3, name },
    risk: {
      score,
      label: riskLabel(score),
      previous_score: previousScore,
      delta,
      direction: delta > 0 ? "escalating" : delta < 0 ? "cooling" : "steady",
    },
    attribution: [
      {
        driver: "other",
        score_contribution: score,
        delta_contribution: delta,
        event_count: 1,
        weight: 1,
      },
    ],
    confidence: 0.95,
    evidence: [],
    evidence_coverage: 1,
    evidence_summary: { event_count: 0, evidence_count: 0, independent_source_count: 0 },
    methodology_version: COUNTRY_RISK_METHOD_VERSION,
    observed_at: generatedAt,
    generated_at: generatedAt,
    expires_at: expiresAt,
    issuer: "Geomacro",
    commercial_eligibility: {
      status: "VERIFIED",
      reason_codes: ["ephemeral_staging_fixture"],
    },
    verification: {
      status: "VERIFIED",
      reason_codes: ["ephemeral_staging_fixture"],
      last_verified_at: generatedAt,
    },
    integrity: {
      input_hash: sha256(`${namespace}:input`),
      data_hash: sha256(`${namespace}:data`),
      calculation_hash: sha256(`${namespace}:calculation`),
      payload_hash: null,
      canonicalization: null,
      signature: null,
      signature_scheme: null,
      signing_key_id: null,
    },
    provenance: {
      structure_versions: ["ephemeral-staging-v1"],
      scoring_versions: [COUNTRY_RISK_METHOD_VERSION],
      relevance_versions: ["ephemeral-staging-v1"],
      country_versions: ["ephemeral-staging-v1"],
      story_versions: ["ephemeral-staging-v1"],
    },
  };
}

function unsignedCorridor(
  usa: GeomacroRiskObject,
  chn: GeomacroRiskObject,
  generatedAt: string,
  expiresAt: string,
): GeomacroRiskObject {
  const score = Math.max(usa.risk.score, chn.risk.score);
  const namespace = `ephemeral-staging:USA>CHN:${generatedAt}`;
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: `gro_ephemeral_usa_chn_${randomUUID()}`,
    subject: { type: "corridor", id: "USA>CHN", name: "United States → China" },
    risk: {
      score,
      label: riskLabel(score),
      previous_score: null,
      delta: null,
      direction: "steady",
    },
    attribution: [
      {
        driver: "other",
        score_contribution: score,
        delta_contribution: null,
        event_count: 2,
        weight: 1,
      },
    ],
    confidence: Math.min(usa.confidence, chn.confidence),
    evidence: [],
    evidence_coverage: 1,
    evidence_summary: { event_count: 0, evidence_count: 0, independent_source_count: 0 },
    methodology_version: CORRIDOR_RISK_METHOD_VERSION,
    corridor_context: {
      origin_country_iso3: "USA",
      destination_country_iso3: "CHN",
      composition: "max_endpoint_score_v1",
      dominant_endpoint: usa.risk.score >= chn.risk.score ? "origin" : "destination",
      source_risk_object_ids: [usa.object_id, chn.object_id],
      source_calculation_hashes: [usa.integrity.calculation_hash, chn.integrity.calculation_hash],
    },
    observed_at: generatedAt,
    generated_at: generatedAt,
    expires_at: expiresAt,
    issuer: "Geomacro",
    commercial_eligibility: {
      status: "VERIFIED",
      reason_codes: ["ephemeral_staging_fixture"],
    },
    verification: {
      status: "VERIFIED",
      reason_codes: ["ephemeral_staging_fixture"],
      last_verified_at: generatedAt,
    },
    integrity: {
      input_hash: sha256(`${namespace}:input`),
      data_hash: sha256(`${namespace}:data`),
      calculation_hash: sha256(`${namespace}:calculation`),
      payload_hash: null,
      canonicalization: null,
      signature: null,
      signature_scheme: null,
      signing_key_id: null,
    },
    provenance: {
      structure_versions: ["ephemeral-staging-v1"],
      scoring_versions: [CORRIDOR_RISK_METHOD_VERSION],
      relevance_versions: ["ephemeral-staging-v1"],
      country_versions: ["ephemeral-staging-v1"],
      story_versions: ["ephemeral-staging-v1"],
    },
  };
}

function appendEnv(name: string, value: string): void {
  const target = process.env.GITHUB_ENV;
  if (!target) fail("GITHUB_ENV is required");
  if (/[\r\n]/.test(value)) fail(`${name} contains a newline`);
  appendFileSync(target, `${name}=${value}\n`, "utf8");
}

async function main() {
  const localSupabaseUrl = requireLocalSupabase();
  const db = requireRiskSupabase();

  const bearer = `rg_ephemeral_${randomBytes(32).toString("base64url")}`;
  const pepper = randomBytes(48).toString("base64url");
  process.env.GEOMACRO_API_CREDENTIAL_PEPPER = pepper;

  console.log(`::add-mask::${bearer}`);
  console.log(`::add-mask::${pepper}`);

  const apiKeyHash = apiCredentialDigest(bearer, "risk-gate-bearer");
  const { error: clientError } = await db.from("risk_gate_api_clients").insert({
    client_id: CLIENT_ID,
    display_name: "Ephemeral Final Acceptance",
    api_key_hash: apiKeyHash,
    enabled: true,
    requests_per_minute: 10000,
    access_tier: "private_pilot",
    quota_class: "limited_free_quota",
    daily_request_limit: 1000000,
  });
  if (clientError) fail(`client insert failed: ${clientError.message}`);

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = `ephemeral-staging-${Date.now()}`;
  const publicKeySpki = exportDerBase64(publicKey, "spki");
  const privateKeyPkcs8 = exportDerBase64(privateKey, "pkcs8");
  const now = Date.now();
  const generatedAt = new Date(now - 30_000).toISOString();
  const expiresAt = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const notBefore = new Date(now - 5 * 60 * 1000).toISOString();
  const notAfter = new Date(now + 3 * 60 * 60 * 1000).toISOString();
  const material = {
    key_id: keyId,
    private_key_pkcs8_b64: privateKeyPkcs8,
    public_key_spki_b64: publicKeySpki,
    not_before: notBefore,
    not_after: notAfter,
  };

  const usa = signRiskObject(
    unsignedCountry("USA", "United States", 30, 28, generatedAt, expiresAt),
    material,
  );
  const chn = signRiskObject(
    unsignedCountry("CHN", "China", 45, 43, generatedAt, expiresAt),
    material,
  );
  const corridor = signRiskObject(unsignedCorridor(usa, chn, generatedAt, expiresAt), material);

  await persistRiskObject(usa);
  await persistRiskObject(chn);
  await persistRiskObject(corridor);

  const registry = JSON.stringify({
    [keyId]: {
      public_key_spki_b64: publicKeySpki,
      status: "active",
      not_before: notBefore,
      not_after: notAfter,
    },
  });

  appendEnv("GEOMACRO_API_CREDENTIAL_PEPPER", pepper);
  appendEnv("RISK_GATE_STAGING_BASE_URL", STAGING_BASE_URL);
  appendEnv("RISK_GATE_STAGING_API_KEY", bearer);
  appendEnv("RISK_OBJECT_VERIFY_KEYS_JSON", registry);
  appendEnv("GEOMACRO_RISK_GATE_COMMERCIAL_MODE", "false");

  mkdirSync(join(process.cwd(), "artifacts"), { recursive: true });
  const evidence = {
    schema: "geomacro.ephemeral-risk-gate-staging.v1",
    generated_at: new Date().toISOString(),
    local_supabase_url: localSupabaseUrl,
    production_data_used: false,
    production_funds_used: false,
    permanent_credential_used: false,
    client_id: CLIENT_ID,
    signing_key_id: keyId,
    public_key_sha256: sha256(publicKeySpki),
    object_ids: [usa.object_id, chn.object_id, corridor.object_id],
    payload_hashes: [usa.integrity.payload_hash, chn.integrity.payload_hash, corridor.integrity.payload_hash],
    subjects: ["USA", "CHN", "USA>CHN"],
    expires_at: expiresAt,
  };
  writeFileSync(
    join(process.cwd(), "artifacts", "ephemeral-risk-gate-staging-provision.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify({
    ok: true,
    client_id: CLIENT_ID,
    signing_key_id: keyId,
    object_ids: evidence.object_ids,
    local_supabase_url: localSupabaseUrl,
  }, null, 2));
}

await main();
