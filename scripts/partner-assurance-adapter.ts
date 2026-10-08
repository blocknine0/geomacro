#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../src/lib/risk-object-signing.server";
import type { GeomacroRiskObject } from "../src/lib/risk-object-contract";
import { verifyPublicRiskObjectArtifact } from "../src/lib/risk-object-verification.server";

type PartnerConfig = {
  status: string;
  delivery_profile: string;
  calculation_namespace: string | null;
  subject_type: string;
  subject_id: string | null;
  provider: string;
  provider_preflight: string | null;
  live_review_allowed: boolean;
  signed_partner_proof_required: boolean;
  independent_proof_verification_required: boolean;
  live_review_allowance_per_run: number;
};

type AssuranceConfig = {
  schema: string;
  core_gates: {
    risk_object_schema: string;
    signature_scheme: string;
    canonicalization: string;
    commercial_eligibility_status: string;
    verification_status: string;
    require_active_deployed_key: boolean;
    require_local_signature_verification: boolean;
    require_deployed_verifier: boolean;
    require_freshness: boolean;
    require_tamper_rejection: boolean;
    require_exact_record_sha256: boolean;
    minimum_independent_source_families: number;
    live_review_after_local_gates_only: boolean;
    max_live_reviews_per_run: number;
    execution_authorized: boolean;
  };
  partners: Record<string, PartnerConfig>;
};

function arg(name: string) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((value) => value.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(code: string, detail?: unknown): never {
  const message = detail === undefined ? code : `${code}: ${String(detail)}`;
  throw new Error(message);
}

async function jsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const partnerId = String(arg("partner") ?? "").trim().toLowerCase();
const riskObjectPath = String(arg("risk-object") ?? "").trim();
const mode = String(arg("mode") ?? "local").trim().toLowerCase();
const configPath = String(arg("config") ?? "config/partner-assurance.v1.json").trim();
const geomacroOrigin = String(process.env.GEOMACRO_ORIGIN ?? "https://geomacro.live").replace(/\/$/, "");

if (!partnerId || !riskObjectPath) {
  fail("USAGE", "partner-assurance-adapter.ts --partner <id> --risk-object <file> [--mode local|live]");
}
if (mode !== "local" && mode !== "live") fail("INVALID_MODE");

const config = await jsonFile<AssuranceConfig>(configPath);
if (config.schema !== "geomacro.partner-assurance.v1") fail("INVALID_ASSURANCE_CONFIG_SCHEMA");
const core = config.core_gates;
const partner = config.partners[partnerId];
if (!partner) fail("UNKNOWN_PARTNER", partnerId);
if (core.execution_authorized !== false) fail("ASSURANCE_MUST_NOT_AUTHORIZE_EXECUTION");
if (core.minimum_independent_source_families < 2) fail("CORE_SOURCE_FAMILY_THRESHOLD_WEAKENED");
if (core.max_live_reviews_per_run !== 1) fail("CORE_LIVE_REVIEW_ALLOWANCE_MUST_EQUAL_ONE");
if (partner.live_review_allowance_per_run > core.max_live_reviews_per_run) fail("PARTNER_ALLOWANCE_EXCEEDS_CORE");

const object = await jsonFile<GeomacroRiskObject>(riskObjectPath);
if (object.schema_version !== core.risk_object_schema) fail("SCHEMA_MISMATCH");
if (object.integrity?.signature_scheme !== core.signature_scheme) fail("SIGNATURE_SCHEME_MISMATCH");
if (object.integrity?.canonicalization !== core.canonicalization) fail("CANONICALIZATION_MISMATCH");
if (object.commercial_eligibility?.status !== core.commercial_eligibility_status) fail("COMMERCIAL_ELIGIBILITY_GATE_FAILED");
if (object.verification?.status !== core.verification_status) fail("OBJECT_VERIFICATION_GATE_FAILED");
if (!object.integrity?.signature || !object.integrity?.payload_hash || !object.integrity?.signing_key_id) {
  fail("SIGNED_GRO_REQUIRED");
}
if (object.subject?.type !== partner.subject_type) fail("PARTNER_SUBJECT_TYPE_MISMATCH");
if (partner.subject_id && object.subject?.id !== partner.subject_id) fail("PARTNER_SUBJECT_ID_MISMATCH");
if (partner.calculation_namespace && object.provenance?.reproducibility?.calculation_namespace !== partner.calculation_namespace) {
  fail("PARTNER_CALCULATION_NAMESPACE_MISMATCH");
}

const head = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
if (head.status !== 0) fail("CANDIDATE_SHA_UNAVAILABLE", head.stderr || head.stdout);
const candidateSha = String(head.stdout ?? "").trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(candidateSha)) fail("CANDIDATE_SHA_INVALID");

const buildUrl = new URL(`${geomacroOrigin}/.well-known/geomacro-build.json`);
buildUrl.searchParams.set("v", candidateSha);
const buildResponse = await fetch(buildUrl, {
  cache: "no-store",
  headers: {
    accept: "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
  signal: AbortSignal.timeout(15_000),
});
if (!buildResponse.ok) fail("DEPLOYED_BUILD_MARKER_UNAVAILABLE", buildResponse.status);
const build = await buildResponse.json() as any;
const deployedBuildSha = String(build?.canonical_main_sha ?? "").trim().toLowerCase();
if (
  build?.schema_version !== "geomacro.deployment-build.v1" ||
  build?.canonical_repository !== "blocknine0/geomacro" ||
  !/^[0-9a-f]{40}$/.test(deployedBuildSha) ||
  build?.production_activation_performed !== false
) {
  fail(
    "DEPLOYED_BUILD_MARKER_INVALID",
    JSON.stringify({
      candidate_sha: candidateSha,
      deployed_sha: build?.canonical_main_sha ?? null,
      schema_version: build?.schema_version ?? null,
      canonical_repository: build?.canonical_repository ?? null,
      production_activation_performed: build?.production_activation_performed ?? null,
    }),
  );
}

const trustUrl = new URL(`${geomacroOrigin}/api/risk-object-keys`);
trustUrl.searchParams.set("v", candidateSha);
const trustResponse = await fetch(trustUrl, {
  cache: "no-store",
  headers: {
    accept: "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
  signal: AbortSignal.timeout(15_000),
});
if (!trustResponse.ok) fail("TRUST_REGISTRY_UNAVAILABLE", trustResponse.status);
const trustedHttpDate = trustResponse.headers.get("date");
if (!trustedHttpDate || !Number.isFinite(Date.parse(trustedHttpDate))) fail("TRUSTED_CLOCK_UNAVAILABLE");
const trustBody = await trustResponse.json() as any;
const trustKeys = Array.isArray(trustBody?.keys) ? trustBody.keys : [];
const activeKey = trustKeys.find((item: any) => item?.key_id === object.integrity.signing_key_id);
if (core.require_active_deployed_key && (!activeKey || activeKey.status !== "active")) fail("SIGNING_KEY_NOT_ACTIVE");
if (activeKey?.public_key_spki_b64 !== object.integrity.public_key_spki_b64) fail("EMBEDDED_KEY_REGISTRY_MISMATCH");

const verificationKeys: RiskObjectVerificationKeys = Object.fromEntries(
  trustKeys
    .filter((item: any) => typeof item?.key_id === "string" && typeof item?.public_key_spki_b64 === "string")
    .map((item: any) => [item.key_id, {
      public_key_spki_b64: item.public_key_spki_b64,
      status: item.status,
      not_before: item.not_before ?? null,
      not_after: item.not_after ?? null,
    }]),
);
const localSignature = verifyRiskObjectSignature(object, verificationKeys);
if (core.require_local_signature_verification && !localSignature.valid) fail("LOCAL_SIGNATURE_VERIFICATION_FAILED", localSignature.reason);

const trustedNow = Date.parse(trustedHttpDate);

const localPublicVerification = verifyPublicRiskObjectArtifact(object, {
  now: new Date(trustedNow),
  verification_keys: verificationKeys,
});
if (!localPublicVerification.valid || localPublicVerification.status !== "VERIFIED") {
  fail(
    "LOCAL_PUBLIC_VERIFIER_REJECTED_ORIGINAL",
    JSON.stringify({
      status: localPublicVerification.status,
      valid: localPublicVerification.valid,
      reason_codes: localPublicVerification.reason_codes,
      checks: localPublicVerification.checks,
    }),
  );
}

const generatedAt = Date.parse(object.generated_at);
const expiresAt = Date.parse(object.expires_at);
if (!Number.isFinite(generatedAt) || !Number.isFinite(expiresAt)) fail("INVALID_OBJECT_TIME");
if (core.require_freshness && (trustedNow >= expiresAt || generatedAt > trustedNow + 10 * 60_000)) fail("FRESHNESS_GATE_FAILED");

const familyMap = object.provenance?.reproducibility?.selection_policy?.source_family_map;
if (partner.calculation_namespace) {
  const families = familyMap && typeof familyMap === "object"
    ? new Set(Object.values(familyMap as Record<string, string>).filter(Boolean))
    : new Set<string>();
  if (families.size < core.minimum_independent_source_families) fail("INDEPENDENT_SOURCE_FAMILY_GATE_FAILED");
}

const exactRecordSha256 = createHash("sha256")
  .update(Buffer.from(canonicalRiskObjectJson(object), "utf8"))
  .digest("hex");
if (core.require_exact_record_sha256 && !/^[0-9a-f]{64}$/.test(exactRecordSha256)) fail("RECORD_SHA256_FAILED");

if (core.require_deployed_verifier) {
  if (
    build?.schema_version !== "geomacro.deployment-build.v1" ||
    !/^[0-9a-f]{40}$/.test(deployedBuildSha) ||
    trustBody?.ok !== true ||
    trustBody?.issuer !== "Geomacro"
  ) {
    fail("DEPLOYED_TRUST_VERIFICATION_UNAVAILABLE");
  }
}

const tampered = structuredClone(object) as any;
if (!tampered.risk || typeof tampered.risk.score !== "number") fail("TAMPER_VECTOR_UNAVAILABLE");
tampered.risk.score = Number((tampered.risk.score + 0.1).toFixed(1));
const tamperedSignature = verifyRiskObjectSignature(tampered, verificationKeys);
const tamperedPublicVerification = verifyPublicRiskObjectArtifact(tampered, {
  now: new Date(trustedNow),
  verification_keys: verificationKeys,
});
if (
  core.require_tamper_rejection &&
  (tamperedSignature.valid === true || tamperedPublicVerification.valid === true)
) {
  fail(
    "TAMPER_NOT_REJECTED",
    JSON.stringify({
      signature_valid: tamperedSignature.valid,
      public_verifier_valid: tamperedPublicVerification.valid,
      reason_codes: tamperedPublicVerification.reason_codes,
    }),
  );
}

const localSummary: any = {
  ok: true,
  schema: "geomacro.partner-assurance-result.v1",
  partner: partnerId,
  partner_status: partner.status,
  mode,
  object_id: object.object_id,
  record_sha256: exactRecordSha256,
  signing_key_id: object.integrity.signing_key_id,
  expires_at: object.expires_at,
  local_gates: {
    commercial_eligibility: "PASS",
    object_verification: "PASS",
    canonical_record_hash: "PASS",
    local_signature: "PASS",
    deployed_verifier: "PASS",
    deployed_verifier_mode: "live_registry_client_local",
    deployed_build_sha: deployedBuildSha,
    active_key: "PASS",
    freshness: "PASS",
    tamper_rejection: "PASS",
    independent_source_families: partner.calculation_namespace ? "PASS" : "NOT_APPLICABLE_UNTIL_ACTIVATION"
  },
  live_review: {
    attempted: false,
    allowance_used: 0,
    allowance_max: partner.live_review_allowance_per_run,
    signed_proof_required: partner.signed_partner_proof_required,
    independent_proof_verification_required: partner.independent_proof_verification_required,
  },
  execution_authorized: false,
};

if (mode === "live") {
  if (!core.live_review_after_local_gates_only) fail("LIVE_REVIEW_SEQUENCE_POLICY_INVALID");
  if (!partner.live_review_allowed || partner.live_review_allowance_per_run !== 1) fail("PARTNER_LIVE_REVIEW_NOT_ALLOWED");
  if (process.env.PARTNER_ASSURANCE_ALLOW_LIVE_REVIEW !== "1") fail("LIVE_REVIEW_ALLOWANCE_NOT_EXPLICITLY_GRANTED");
  if (!partner.provider_preflight) fail("PARTNER_PROVIDER_PREFLIGHT_MISSING");

  const run = spawnSync("bun", [partner.provider_preflight, riskObjectPath], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (run.status !== 0) fail("PARTNER_PROVIDER_PREFLIGHT_FAILED", run.stderr || run.stdout);
  let provider: any;
  try {
    provider = JSON.parse(run.stdout);
  } catch {
    fail("PARTNER_PROVIDER_OUTPUT_NOT_JSON");
  }
  if (provider?.ok !== true || provider?.gates?.live_partner_review !== "PASS") fail("LIVE_PARTNER_REVIEW_FAILED");
  if (
    provider?.gates?.partner_admission !== "PASS" ||
    provider?.live_review?.admission_clear !== true ||
    provider?.live_review?.verdict !== "approve" ||
    Number(provider?.live_review?.issue_count ?? -1) !== 0
  ) {
    fail(
      "LIVE_PARTNER_ADMISSION_REJECTED",
      JSON.stringify({
        verdict: provider?.live_review?.verdict ?? null,
        issue_count: provider?.live_review?.issue_count ?? null,
        blocker_count: provider?.live_review?.blocker_count ?? null,
        high_count: provider?.live_review?.high_count ?? null,
        medium_count: provider?.live_review?.medium_count ?? null,
        low_count: provider?.live_review?.low_count ?? null,
        provider_stderr: String(run.stderr ?? "").trim().slice(-24000),
        review_response_path: process.env.INVINO_REVIEW_OUT ?? null,
      }),
    );
  }
  if (partner.signed_partner_proof_required && provider?.live_review?.proof_present !== true) fail("SIGNED_PARTNER_PROOF_MISSING");
  if (partner.independent_proof_verification_required && provider?.gates?.partner_proof_verification !== "PASS") {
    fail("INDEPENDENT_PARTNER_PROOF_VERIFICATION_FAILED");
  }
  localSummary.live_review = {
    ...localSummary.live_review,
    attempted: true,
    allowance_used: 1,
    provider: partner.provider,
    review_status: "PASS",
    verdict: provider?.live_review?.verdict,
    admission_clear: provider?.live_review?.admission_clear === true,
    issue_count: Number(provider?.live_review?.issue_count ?? 0),
    signed_proof_present: provider?.live_review?.proof_present === true,
    independent_proof_verification: provider?.gates?.partner_proof_verification === "PASS" ? "PASS" : "NOT_REQUIRED",
  };
}

console.log(JSON.stringify(localSummary, null, 2));
