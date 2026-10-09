/**
 * #1827 first Supabase-free GRI v1.2 compute/proof stage.
 *
 * Accept a separately SHA-pinned canonical PRIVATE admission, not unvetted
 * articles or the public/private classifier staging list. Never infer a
 * commercial license, publisher corroboration, attestation or score freshness
 * from the mere existence of classification results. No network, DB or B2 I/O.
 * This stage is NOT a public publisher, pays nothing and cannot turn 503 green.
 */
import { createHash } from "node:crypto";
import {
  calculateGri,
  canonicalJson,
  GRI_CATEGORIES,
  GRI_METHOD_VERSION,
  GRI_STORY_CORRELATION_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
} from "./gri-engine-v12.js";
import { GRI_DISPOSITION, buildSourceDisposition } from "./gri-disposition-v12.js";
import {
  buildPortableGriProofBundle,
  verifyPortableGriProofBundle,
} from "./gri-portable-proof-v12.js";

export const GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA =
  "geomacro.gri-v12-private-offline-admission.v1";
export const GRI_PRIVATE_OFFLINE_PROOF_SCHEMA =
  "geomacro.gri-v12-private-offline-proof.v1";
export const GRI_PRIVATE_MAX_EVENTS = 180;
const MAX_SNAPSHOT_AGE_MS = 90 * 60_000;
const LOOKBACK_MS = 72 * 60 * 60_000;
const HASH = /^[a-f0-9]{64}$/u;
const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CLASSIFIER_VERSION = "event-severity-v1.0.5";
const CLASSIFIER_PROMPT = "risk-desk-filter-v1.0.5";
const ALLOWED_CLASSIFIERS = new Set(["groq", "gemini", "mistral", "cerebras"]);
const ALLOWED_EVENT_KEYS = new Set([
  "id", "category", "severity", "confidence",
  "created_at", "published_at",
  "source_name", "source_domain", "source_url",
  "source_title", "summary",
  "classification_provider", "classification_model",
  "classification_version", "classification_prompt_version",
  "classification_scored_at", "classification_input_hash",
  "story_cluster_id", "story_canonical_label", "story_assignment_decision",
  "story_match_confidence", "story_decision_rationale",
  "story_clustering_provider", "story_clustering_model",
  "story_clustering_version", "story_clustering_prompt_version",
  "story_clustering_scored_at", "story_clustering_input_hash",
]);
const ALLOWED_ADMISSION_KEYS = new Set([
  "schema", "as_of", "private_only", "commercial_eligible",
  "public_published", "rights_verification_pending",
  "independent_corroboration_pending", "events",
]);

export const griPrivateSha256 = value =>
  createHash("sha256").update(value).digest("hex");

function privateAssertion(condition, reason) {
  if (!condition) throw new Error(reason);
}

function strictTimestamp(value, reason) {
  privateAssertion(typeof value === "string" && UTC_ISO.test(value), reason);
  const timestamp = Date.parse(value);
  privateAssertion(Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === value, reason);
  return timestamp;
}

function validateRow(row, asOfMs) {
  privateAssertion(row && typeof row === "object" &&
    !Array.isArray(row), "GRI_PRIVATE_EVENT_INVALID");
  privateAssertion(Object.keys(row).every(key => ALLOWED_EVENT_KEYS.has(key)),
    "GRI_PRIVATE_UNEXPECTED_EVENT_FIELD");
  privateAssertion(typeof row.id === "string" &&
    row.id.length >= 4 && row.id.length <= 160,
    "GRI_PRIVATE_EVENT_ID_INVALID");
  privateAssertion(GRI_CATEGORIES.includes(row.category),
    "GRI_PRIVATE_CATEGORY_INVALID");
  privateAssertion(Number.isInteger(row.severity) &&
    row.severity >= 0 && row.severity <= 100 &&
    Number.isInteger(row.confidence) &&
    row.confidence > 0 && row.confidence <= 100,
    "GRI_PRIVATE_SCORE_INVALID");

  const observedAt = strictTimestamp(row.created_at, "GRI_PRIVATE_ORIGINAL_OBSERVED_AT_INVALID");
  const publishedAt = strictTimestamp(row.published_at, "GRI_PRIVATE_SOURCE_PUBLISHED_AT_INVALID");
  const classifiedAt = strictTimestamp(row.classification_scored_at,
    "GRI_PRIVATE_CLASSIFICATION_TIME_INVALID");
  const clusteredAt = strictTimestamp(row.story_clustering_scored_at,
    "GRI_PRIVATE_STORY_TIME_INVALID");
  privateAssertion(publishedAt <= observedAt && observedAt <= asOfMs &&
    classifiedAt <= asOfMs && clusteredAt <= asOfMs &&
    observedAt >= asOfMs - LOOKBACK_MS,
    "GRI_PRIVATE_TIME_ORDER_OR_LOOKBACK_INVALID");

  privateAssertion(
    row.classification_version === CLASSIFIER_VERSION &&
    row.classification_prompt_version === CLASSIFIER_PROMPT &&
    ALLOWED_CLASSIFIERS.has(row.classification_provider) &&
    typeof row.classification_model === "string" &&
    row.classification_model.trim().length >= 2 &&
    HASH.test(row.classification_input_hash),
    "GRI_PRIVATE_CANONICAL_CLASSIFIER_PROVENANCE_INVALID",
  );
  privateAssertion(
    row.story_clustering_version === GRI_STORY_CORRELATION_VERSION &&
    row.story_clustering_prompt_version === GRI_STORY_CORRELATION_PROMPT_VERSION &&
    typeof row.story_clustering_provider === "string" &&
    row.story_clustering_provider.trim().length >= 2 &&
    typeof row.story_clustering_model === "string" &&
    row.story_clustering_model.trim().length >= 2 &&
    HASH.test(row.story_clustering_input_hash) &&
    typeof row.story_cluster_id === "string" && row.story_cluster_id.trim().length >= 4 &&
    typeof row.story_canonical_label === "string" &&
    row.story_canonical_label.trim().length >= 4 &&
    ["anchor", "matched"].includes(row.story_assignment_decision) &&
    Number.isInteger(row.story_match_confidence) &&
    row.story_match_confidence >= 0 && row.story_match_confidence <= 100 &&
    typeof row.story_decision_rationale === "string" &&
    row.story_decision_rationale.trim().length >= 8,
    "GRI_PRIVATE_CANONICAL_STORY_PROVENANCE_INVALID",
  );
  privateAssertion(typeof row.source_domain === "string" &&
    typeof row.source_url === "string" &&
    typeof row.source_title === "string" &&
    row.source_title.trim().length >= 16 &&
    typeof row.summary === "string" && row.summary.trim().length >= 12,
    "GRI_PRIVATE_SOURCE_METADATA_INVALID");
  let url;
  try { url = new URL(row.source_url); } catch {
    throw new Error("GRI_PRIVATE_PUBLISHER_URL_INVALID");
  }
  privateAssertion(url.protocol === "https:" && !url.username && !url.password &&
    url.href.length <= 2048 &&
    url.hostname.toLowerCase() === row.source_domain.toLowerCase() &&
    url.hostname.includes("."),
    "GRI_PRIVATE_ORIGINAL_PUBLISHER_IDENTITY_INVALID");
}

export function buildPrivateSupabaseFreeGriProof({
  admission,
  expectedInputSha256,
  now = new Date(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  privateAssertion(Number.isFinite(nowMs), "GRI_PRIVATE_RUNTIME_TIME_INVALID");
  privateAssertion(HASH.test(String(expectedInputSha256 ?? "")),
    "GRI_PRIVATE_EXTERNALLY_PINNED_INPUT_HASH_REQUIRED");
  privateAssertion(admission && typeof admission === "object" &&
    !Array.isArray(admission) &&
    Object.keys(admission).every(key => ALLOWED_ADMISSION_KEYS.has(key)),
    "GRI_PRIVATE_ADMISSION_INVALID");
  privateAssertion(
    admission.schema === GRI_PRIVATE_OFFLINE_ADMISSION_SCHEMA &&
    admission.private_only === true &&
    admission.public_published === false &&
    admission.commercial_eligible === false &&
    admission.rights_verification_pending === true &&
    admission.independent_corroboration_pending === true,
    "GRI_PRIVATE_NONCOMMERCIAL_BOUNDARY_INVALID",
  );
  const asOfMs = strictTimestamp(admission.as_of, "GRI_PRIVATE_AS_OF_INVALID");
  privateAssertion(
    asOfMs <= nowMs + 5 * 60_000 && nowMs - asOfMs <= MAX_SNAPSHOT_AGE_MS,
    "GRI_PRIVATE_AS_OF_STALE_OR_FUTURE",
  );
  privateAssertion(Array.isArray(admission.events) &&
    admission.events.length >= GRI_CATEGORIES.length &&
    admission.events.length <= GRI_PRIVATE_MAX_EVENTS,
    "GRI_PRIVATE_EVENT_COUNT_INVALID");
  const inputHash = griPrivateSha256(canonicalJson(admission));
  privateAssertion(inputHash === expectedInputSha256,
    "GRI_PRIVATE_INPUT_HASH_MISMATCH");

  const seen = new Set();
  const latestByDomain = new Map();
  for (const row of admission.events) {
    validateRow(row, asOfMs);
    privateAssertion(!seen.has(row.id), "GRI_PRIVATE_EVENT_DUPLICATE");
    seen.add(row.id);
    latestByDomain.set(row.category,
      Math.max(latestByDomain.get(row.category) ?? 0, Date.parse(row.created_at)));
  }
  for (const category of GRI_CATEGORIES) {
    privateAssertion(
      latestByDomain.has(category) &&
      asOfMs - latestByDomain.get(category) <= MAX_SNAPSHOT_AGE_MS,
      "GRI_PRIVATE_DOMAIN_NOT_CURRENT:" + category,
    );
  }
  const calculation = calculateGri(admission.events, new Date(asOfMs));
  privateAssertion(calculation.methodologyVersion === GRI_METHOD_VERSION &&
    calculation.coverage === 1 &&
    calculation.eventCount === admission.events.length &&
    calculation.rawScore !== null &&
    calculation.categories.length === GRI_CATEGORIES.length,
    "GRI_PRIVATE_CALCULATION_COVERAGE_INVALID");
  const byId = new Map(admission.events.map(row => [row.id, row]));
  const dispositions = calculation.contributions.map(contribution =>
    buildSourceDisposition({
      event: byId.get(contribution.eventId),
      contribution,
      disposition: GRI_DISPOSITION.INCLUDED,
      classificationSource: "direct",
    }),
  );
  privateAssertion(dispositions.length === admission.events.length,
    "GRI_PRIVATE_DISPOSITION_COUNT_INVALID");
  const proof = buildPortableGriProofBundle({
    currentCalculation: calculation,
    previousCalculation: null, // no fabricated previous snapshot, delta or history
    dispositions,
  });
  const report = verifyPortableGriProofBundle(proof, {
    expectedProofHash: proof.proof.proofHash,
  });
  privateAssertion(report.valid === true &&
    report.internallyReproducible === true &&
    report.recomputed.contributionResidual !== null &&
    Math.abs(report.recomputed.contributionResidual) <= 1e-6,
    "GRI_PRIVATE_PORTABLE_PROOF_NOT_REPRODUCIBLE");
  return {
    schema: GRI_PRIVATE_OFFLINE_PROOF_SCHEMA,
    private_only: true,
    public_published: false,
    commercial_eligible: false,
    rights_verification_pending: true,
    independent_corroboration_pending: true,
    input_authenticity_independently_verified: false,
    original_input_sha256: inputHash,
    original_source_as_of: admission.as_of,
    verified_methodology: GRI_METHOD_VERSION,
    current_coverage: calculation.coverage,
    current_categories: [...GRI_CATEGORIES],
    event_count: calculation.eventCount,
    portable_proof_hash: proof.proof.proofHash,
    portable_bundle_hash: proof.bundleHash,
    portable_proof: proof, // PRIVATE ONLY: contains source provenance, not customer-safe
  };
}
