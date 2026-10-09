import { createHash } from "node:crypto";
import { preparePrivateDerivedText, validatePrivateDerivedRecord } from "./private-derived-text-quality.mjs";

export const PRIVATE_STAGE_SCHEMA = "geomacro.restricted-private-scored-stage.v1";
export const CANONICAL_CLASSIFIER_VERSION = "event-severity-v1.0.5";
export const CANONICAL_PROMPT_VERSION = "risk-desk-filter-v1.0.5";
export const STAGE_DOMAINS = Object.freeze(["geopolitics", "macro", "rare_earth"]);
export const MAX_PRIVATE_STAGE_ROWS = 6;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const HASH = /^[a-f0-9]{64}$/u;
const PROVIDERS = new Set(["groq", "gemini", "mistral", "cerebras"]);

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function safeTime(value, nowMs) {
  const millis = Date.parse(String(value ?? ""));
  if (!Number.isFinite(millis) || millis > nowMs + MAX_FUTURE_MS ||
      nowMs - millis > MAX_AGE_MS) {
    throw new Error("PRIVATE_SCORING_ORIGINAL_PUBLISH_TIME_INVALID");
  }
  return new Date(millis).toISOString();
}

function sourceIdentity(article) {
  let source;
  try {
    source = new URL(String(article?.url ?? ""));
  } catch {
    throw new Error("PRIVATE_SCORING_SOURCE_URL_INVALID");
  }
  if (source.protocol !== "https:" || source.username || source.password ||
      source.hostname.length < 4 || !source.hostname.includes(".") ||
      source.href.length > 2048) {
    throw new Error("PRIVATE_SCORING_SOURCE_URL_INVALID");
  }
  const sourceDomain = String(article?.sourceDomain ?? "").trim().toLowerCase();
  if (!sourceDomain || sourceDomain !== source.hostname.toLowerCase()) {
    throw new Error("PRIVATE_SCORING_ORIGINAL_PUBLISHER_UNVERIFIED");
  }
  const normalizedTitle = String(article?.title ?? "").replace(/\s+/gu, " ").trim();
  if (normalizedTitle.length < 16) {
    throw new Error("PRIVATE_SCORING_SOURCE_TITLE_MISSING");
  }
  return {
    source_url: source.href,
    source_domain: sourceDomain,
    source_title_sha256: sha256(normalizedTitle.toLowerCase()),
  };
}

/**
 * Only existing canonical classifier/gates may call this after admission.
 * This is PRIVATE UNCORROBORATED evidence staging; it is not commercial
 * eligibility, not a new risk methodology, and is never used by public UI.
 */
export function makePrivateStageRecord({ article, assessment, category, now = new Date() }) {
  if (!STAGE_DOMAINS.includes(category) ||
      assessment?.relevant !== true ||
      assessment?.category !== category ||
      assessment?.ungrounded === true ||
      assessment?.classificationVersion !== CANONICAL_CLASSIFIER_VERSION ||
      assessment?.classificationPromptVersion !== CANONICAL_PROMPT_VERSION) {
    throw new Error("PRIVATE_SCORING_CANONICAL_ADMISSION_INVALID");
  }
  const severity = Number(assessment.severity);
  const confidence = Number(assessment.confidence);
  if (!Number.isInteger(severity) || severity < 0 || severity > 100 ||
      !Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error("PRIVATE_SCORING_SCORE_INVALID");
  }
  if (!PROVIDERS.has(assessment.classificationProvider) ||
      typeof assessment.classificationModel !== "string" ||
      assessment.classificationModel.length < 2 ||
      !HASH.test(String(assessment.classificationInputHash ?? ""))) {
    throw new Error("PRIVATE_SCORING_CLASSIFIER_PROVENANCE_INVALID");
  }
  const timestamp = safeTime(article?.publishedAt, now.getTime());
  const identity = sourceIdentity(article);
  const derived = preparePrivateDerivedText(assessment);
  const id = sha256([category, identity.source_url, identity.source_title_sha256, timestamp].join("\n"));
  return {
    id,
    category,
    observed_at: timestamp,
    severity,
    confidence,
    narrative: derived.narrative,
    summary: derived.summary,
    editorial_review_pending: derived.editorial_review_pending,
    classifier: {
      version: CANONICAL_CLASSIFIER_VERSION,
      prompt_version: CANONICAL_PROMPT_VERSION,
      provider: assessment.classificationProvider,
      model: assessment.classificationModel,
      input_sha256: assessment.classificationInputHash,
    },
    // Internal archive only: these must never be copied to customer responses.
    private_source: identity,
    rights_verified: false,
    independently_corroborated: false,
    public_eligible: false,
  };
}

export function makePrivateStageBundle(records, { now = new Date() } = {}) {
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_PRIVATE_STAGE_ROWS) {
    throw new Error("PRIVATE_SCORING_STAGE_ROW_COUNT_INVALID");
  }
  const seen = new Set();
  const rows = records.map((row) => {
    if (!row || typeof row !== "object" || !STAGE_DOMAINS.includes(row.category) ||
        !HASH.test(String(row.id ?? "")) ||
        row.classifier?.version !== CANONICAL_CLASSIFIER_VERSION ||
        row.classifier?.prompt_version !== CANONICAL_PROMPT_VERSION ||
        !PROVIDERS.has(row.classifier?.provider) ||
        !HASH.test(String(row.classifier?.input_sha256 ?? "")) ||
        !Number.isInteger(row.severity) || row.severity < 0 || row.severity > 100 ||
        !Number.isInteger(row.confidence) || row.confidence < 0 || row.confidence > 100 ||
        row.public_eligible !== false || row.rights_verified !== false ||
        row.independently_corroborated !== false) {
      throw new Error("PRIVATE_SCORING_STAGE_ROW_INVALID");
    }
    safeTime(row.observed_at, now.getTime());
    const source = sourceIdentity({
      url: row.private_source?.source_url,
      sourceDomain: row.private_source?.source_domain,
      title: "Verified private source-title hash placeholder",
    });
    if (!HASH.test(String(row.private_source?.source_title_sha256 ?? "")) ||
        source.source_url !== row.private_source.source_url) {
      throw new Error("PRIVATE_SCORING_STAGE_SOURCE_INVALID");
    }
    validatePrivateDerivedRecord(row);
    if (seen.has(row.id)) throw new Error("PRIVATE_SCORING_STAGE_DUPLICATE");
    seen.add(row.id);
    return row;
  }).sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

  const counts = Object.fromEntries(STAGE_DOMAINS.map((category) =>
    [category, rows.filter((row) => row.category === category).length]));
  return {
    schema: PRIVATE_STAGE_SCHEMA,
    created_at: now.toISOString(),
    classifier_version: CANONICAL_CLASSIFIER_VERSION,
    public_eligible: false,
    raw_data_delivered: false,
    rights_verification_pending: true,
    independent_corroboration_pending: true,
    source_urls_private_only: true,
    counts,
    rows,
  };
}

export function validatePrivateStageBundle(value, { now = new Date() } = {}) {
  if (!value || value.schema !== PRIVATE_STAGE_SCHEMA ||
      value.classifier_version !== CANONICAL_CLASSIFIER_VERSION ||
      value.public_eligible !== false || value.raw_data_delivered !== false ||
      value.rights_verification_pending !== true ||
      value.independent_corroboration_pending !== true ||
      value.source_urls_private_only !== true) {
    throw new Error("PRIVATE_SCORING_STAGE_CONTRACT_INVALID");
  }
  const recomputed = makePrivateStageBundle(value.rows, { now });
  if (JSON.stringify(recomputed.counts) !== JSON.stringify(value.counts) ||
      JSON.stringify(recomputed.rows) !== JSON.stringify(value.rows) ||
      !Number.isFinite(Date.parse(value.created_at)) ||
      new Date(value.created_at).getTime() > now.getTime() + MAX_FUTURE_MS) {
    throw new Error("PRIVATE_SCORING_STAGE_BINDING_INVALID");
  }
  return recomputed;
}
