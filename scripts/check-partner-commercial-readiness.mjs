#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

function fail(message) {
  console.error(`PARTNER_COMMERCIAL_READINESS_FAIL: ${message}`);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const discoveryPath = "public/.well-known/geomacro-partner-verification.json";
const positiveControlPath = "test-vectors/federico-strict-positive-control-v1.json";
const preflightPath = "scripts/invinoveritas-risk-object-preflight.ts";
const docsPath = "docs/PARTNER_VERIFICATION_AND_COMMERCIAL_INTEGRATION.md";
const positiveControlWorkflow = ".github/workflows/federico-strict-positive-control.yml";
const partnerWorkflow = ".github/workflows/partner-commercial-readiness.yml";
const assuranceConfigPath = "config/partner-assurance.v1.json";
const assuranceAdapterPath = "scripts/partner-assurance-adapter.ts";
const finalGateCorePath = "scripts/ops/final-launch-gate-core.mjs";
const day6WorkflowPath = ".github/workflows/day6-partner-assurance-final.yml";
const day6ProbeWorkflowPath = ".github/workflows/day6-fresh-evidence-probe.yml";
const federicoRepeatabilityWorkflowPath = ".github/workflows/federico-repeatability.yml";
const federicoRepeatabilityScriptPath = "scripts/check-federico-repeatability.mjs";

for (const path of [
  discoveryPath,
  positiveControlPath,
  preflightPath,
  docsPath,
  positiveControlWorkflow,
  partnerWorkflow,
  assuranceConfigPath,
  assuranceAdapterPath,
  finalGateCorePath,
  day6WorkflowPath,
  day6ProbeWorkflowPath,
  federicoRepeatabilityWorkflowPath,
  federicoRepeatabilityScriptPath,
]) {
  if (!existsSync(path)) fail(`missing required partner artifact: ${path}`);
}

const discovery = readJson(discoveryPath);
const positiveControl = readJson(positiveControlPath);
const assurance = readJson(assuranceConfigPath);
const preflight = readFileSync(preflightPath, "utf8");
const docs = readFileSync(docsPath, "utf8");
const positiveWorkflow = readFileSync(positiveControlWorkflow, "utf8");
const adapter = readFileSync(assuranceAdapterPath, "utf8");
const finalGateCore = readFileSync(finalGateCorePath, "utf8");
const day6Workflow = readFileSync(day6WorkflowPath, "utf8");
const day6ProbeWorkflow = readFileSync(day6ProbeWorkflowPath, "utf8");
const federicoRepeatabilityWorkflow = readFileSync(federicoRepeatabilityWorkflowPath, "utf8");
const federicoRepeatabilityScript = readFileSync(federicoRepeatabilityScriptPath, "utf8");

if (discovery.schema_version !== "geomacro-partner-verification-v1") {
  fail("unexpected partner discovery schema_version");
}
if (discovery.risk_object?.schema !== "gro-1.1") fail("risk-object schema mismatch");
if (discovery.risk_object?.signature_scheme !== "Ed25519") fail("signature scheme mismatch");
if (discovery.risk_object?.canonicalization !== "geomacro-canonical-json-v1") {
  fail("canonicalization mismatch");
}
if (discovery.federation?.supported_profile !== "federico-strict-evidence-v1") {
  fail("Federico strict profile missing from partner discovery");
}
if (Number(discovery.federation?.minimum_independent_source_families ?? 0) < 2) {
  fail("partner federation minimum independent source families is below 2");
}
if (discovery.federation?.fail_closed !== true) fail("partner federation must fail closed");
if (discovery.federation?.receiver_side_verification_required !== true) {
  fail("receiver-side verification must be required");
}
if (discovery.security?.no_execution_authority !== true) {
  fail("partner verification must not grant execution authority");
}
if (discovery.commercial_path?.production_pilot !== "contract_required") {
  fail("production pilot must require a contract");
}
if (discovery.commercial_path?.data_redistribution !== "derived-output-only unless separately licensed") {
  fail("derived-only redistribution boundary missing");
}

if (positiveControl?.calculation_namespace !== "federico_strict_evidence_v1") {
  fail("positive control calculation namespace mismatch");
}
if (positiveControl?.expected?.publication_policy_accepts !== true) {
  fail("positive control is not declared as a known-good publication vector");
}
if (!Array.isArray(positiveControl?.events) || positiveControl.events.length < 1) {
  fail("positive control contains no events");
}

if (assurance?.schema !== "geomacro.partner-assurance.v1") {
  fail("generic partner assurance schema mismatch");
}
if (Number(assurance?.core_gates?.minimum_independent_source_families ?? 0) < 2) {
  fail("generic assurance weakens independent-source threshold");
}
if (Number(assurance?.core_gates?.max_live_reviews_per_run ?? 0) !== 1) {
  fail("generic assurance must cap live partner review to one per run");
}
if (assurance?.core_gates?.live_review_after_local_gates_only !== true) {
  fail("generic assurance must sequence live review after local gates");
}
if (assurance?.core_gates?.execution_authorized !== false) {
  fail("generic assurance must never authorize execution");
}

const federico = assurance?.partners?.federico;
if (
  federico?.delivery_profile !== "FEDERICO_STRICT" ||
  federico?.calculation_namespace !== "federico_strict_evidence_v1" ||
  federico?.subject_type !== "country" ||
  federico?.subject_id !== null ||
  federico?.signed_partner_proof_required !== true ||
  federico?.independent_proof_verification_required !== true ||
  Number(federico?.live_review_allowance_per_run ?? 0) !== 1
) {
  fail("Federico generic assurance contract is incomplete or country-scoped");
}

const secondPartner = assurance?.partners?.goat;
if (
  secondPartner?.status !== "MAPPED_NOT_ACTIVATED" ||
  secondPartner?.live_review_allowed !== false ||
  Number(secondPartner?.live_review_allowance_per_run ?? -1) !== 0
) {
  fail("second partner must be mapped without activation or threshold bypass");
}

for (const required of [
  "external_evidence",
  "record_sha256",
  "sign: true",
  "partial_disclosure",
  "proof_verification",
  "independent_node",
  "execution_authorized: false",
  "verifyRiskObjectSignature",
  "verifyPublicRiskObjectArtifact",
  "live_registry_client_local",
  "registryResponseSha256",
  "tamperedSignature",
  "tamperedVerification",
]) {
  if (!preflight.includes(required)) fail(`preflight missing required contract marker: ${required}`);
}
if (
  preflight.includes("async function verify(object: unknown)") ||
  preflight.includes("Original Risk Object failed deployed verification")
) {
  fail("Federico provider preflight must not depend on Geomacro central POST verification");
}

for (const required of [
  "Commercial progression",
  "Technical evaluation",
  "production partner agreement",
  "Raw third-party source material must not be redistributed",
]) {
  if (!docs.includes(required)) fail(`commercial partner docs missing section/guardrail: ${required}`);
}

if (adapter.includes("async function deployedVerify") || adapter.includes("DEPLOYED_VERIFIER_REJECTED_ORIGINAL")) {
  fail("Federico local assurance must not depend on the redundant deployed POST verifier");
}
if (!adapter.includes("/.well-known/geomacro-build.json")) {
  fail("Federico local assurance must verify the live canonical build marker");
}

for (const required of [
  "PARTNER_ASSURANCE_ALLOW_LIVE_REVIEW",
  "LIVE_REVIEW_ALLOWANCE_NOT_EXPLICITLY_GRANTED",
  "PARTNER_ALLOWANCE_EXCEEDS_CORE",
  "LOCAL_SIGNATURE_VERIFICATION_FAILED",
  "DEPLOYED_BUILD_MARKER_INVALID",
  "DEPLOYED_TRUST_VERIFICATION_UNAVAILABLE",
  "live_registry_client_local",
  "TAMPER_NOT_REJECTED",
  "SIGNED_PARTNER_PROOF_MISSING",
  "INDEPENDENT_PARTNER_PROOF_VERIFICATION_FAILED",
  "canonicalRiskObjectJson",
]) {
  if (!adapter.includes(required)) fail(`generic assurance adapter missing guardrail: ${required}`);
}

for (const required of [
  "d1_primary_control_plane",
  "b2_durable_authority",
  "durable_object_commerce",
  "supabase_cold_standby",
  "risk_object_trust",
  "scheduler_health",
  "exact_head_gates",
  "partner_specific_assurance_required: false",
  "real_funds_authorized: false",
]) {
  if (!finalGateCore.includes(required)) fail(`final launch gate missing authority/gate: ${required}`);
}

for (const required of [
  'artifact_version: "geomacro-invino-review-v7"',
  'receiver_policy_id: "federico-global-country-risk-v1"',
  'subject_id: reviewSubjectId',
  '!/^[A-Z]{3}$/.test(reviewSubjectId)',
]) {
  if (!preflight.includes(required)) fail(`global strict preflight missing marker: ${required}`);
}
if (
  preflight.includes('subject_id: "CHN"') ||
  preflight.includes("federico-china-country-risk-v1")
) {
  fail("strict partner preflight regressed to CHN-only admission");
}

for (const required of [
  "use_partner_allowance:",
  "default: false",
  "inputs.use_partner_allowance == true",
  "DAY6_COUNTRY_ISO3",
  "partner_allowance_spent == false",
]) {
  if (!day6Workflow.includes(required)) fail(`Day 6 allowance guard missing marker: ${required}`);
}
if (day6Workflow.includes("schedule:")) {
  fail("Day 6 partner assurance must remain manual-only");
}
if (
  day6ProbeWorkflow.includes("schedule:") ||
  day6ProbeWorkflow.includes("gh workflow run day6-partner-assurance-final.yml")
) {
  fail("Day 6 readiness probe must not schedule or auto-dispatch partner allowance use");
}
if (!day6ProbeWorkflow.includes("partner_allowance_spent == false")) {
  fail("Day 6 readiness probe must prove zero partner allowance use");
}

if (!positiveWorkflow.includes("persist-credentials: false")) {
  fail("positive-control workflow must disable persisted Git credentials");
}
if (!positiveWorkflow.includes("check-federico-positive-control.ts")) {
  fail("positive-control workflow does not execute the known-good verifier");
}
for (const required of [
  'cron: "13 */6 * * *"',
  "check-federico-repeatability.mjs",
  "persist-credentials: false",
]) {
  if (!federicoRepeatabilityWorkflow.includes(required)) {
    fail(`Federico repeatability workflow missing marker: ${required}`);
  }
}
if (
  federicoRepeatabilityWorkflow.includes("INVINO_API_KEY") ||
  federicoRepeatabilityWorkflow.includes("use_partner_allowance=true")
) {
  fail("Federico repeatability workflow must never spend partner allowance");
}
for (const required of [
  "POSITIVE_CONTROL_RUNS = 5",
  "POSITIVE_CONTROL_NON_DETERMINISTIC",
  "PUBLIC_PARTNER_CONTRACT_NON_DETERMINISTIC",
  "ACTIVE_TRUST_SET_CHANGED_WITHIN_PROBE",
  "partner_allowance_used: 0",
  "user_funds_used: false",
]) {
  if (!federicoRepeatabilityScript.includes(required)) {
    fail(`Federico repeatability verifier missing marker: ${required}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  contract: "geomacro-partner-commercial-readiness-v2",
  risk_object_schema: discovery.risk_object.schema,
  federation_profile: discovery.federation.supported_profile,
  positive_control: "present",
  generic_partner_assurance: "present",
  federico_live_review_allowance_per_run: federico.live_review_allowance_per_run,
  second_partner_mapping: "goat:MAPPED_NOT_ACTIVATED",
  external_review_binding: discovery.partner_handoff.external_evidence_binding,
  independent_proof_verification_required:
    discovery.partner_handoff.independent_proof_verification_required,
  production_pilot: discovery.commercial_path.production_pilot,
  paid_api: discovery.commercial_path.paid_api,
  fail_closed: discovery.federation.fail_closed,
  federico_repeatability_gate: "Federico Repeatability Gate",
  federico_repeatability_same_record_deterministic: true,
}, null, 2));
