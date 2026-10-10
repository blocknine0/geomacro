#!/usr/bin/env node
// Offline PRIVATE handoff. This module never contacts Telegram, official sites,
// B2, D1, Supabase, Geomacro APIs, x402, or external model providers.
import { createHash } from "node:crypto";

export const MANUAL_RESEARCH_SCHEMA = "geomacro.telegram-human-research-lead.v1";
export const CORROBORATION_PACKET_SCHEMA = "geomacro.internal-manual-corroboration-review.v1";
const CATEGORIES = new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
const TOPICS = {
  GEOPOLITICS: new Set(["DIPLOMACY", "SANCTIONS", "CONFLICT", "TRADE_POLICY", "ELECTION_POLICY", "SECURITY_POLICY"]),
  MACRO: new Set(["CENTRAL_BANK", "INFLATION", "FX_POLICY", "FISCAL_POLICY", "ECONOMIC_OUTPUT", "TRADE_DATA"]),
  CRITICAL_MINERALS: new Set(["MINING_POLICY", "EXPORT_CONTROL", "SUPPLY_DISRUPTION", "PROCESSING", "RESERVES", "CAPACITY"]),
};
const SHA = /^[a-f0-9]{64}$/;
const ID = /^tgresearch_[a-f0-9]{32}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const FAMILY = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const POINTER_KEYS = [
  "schema", "reference_id", "reference_sha256", "category", "topic_code", "country_iso3",
  "source_native_published_at_claimed", "observed_at", "historical_reference",
  "source_kind", "reference_registered", "human_reference_attested",
  "source_native_time_independently_verified", "automated_collection_authorized",
  "has_source_message_payload", "verification_status", "editorial_status",
  "scoring_eligible", "commercial_eligible", "public_published",
];
const EVIDENCE_KEYS = ["publisher_family_claim", "original_publisher_url", "published_at_claimed"];
const INPUT_KEYS = ["schema", "human_review_requested", "research_pointer", "official_evidence_candidates"];

function fail(code) { throw new Error(code); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keysExactly(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}
function isoUtc(value, name, clock) {
  if (typeof value !== "string" || !ISO_UTC.test(value)) fail(name + "_INVALID");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !==
      new Date(value).toISOString() || ms > clock + 5 * 60000) {
    fail(name + "_INVALID");
  }
  return ms;
}
function sha256(text) { return createHash("sha256").update(text).digest("hex"); }

export function verifyInternalResearchPointer(pointer, now = new Date()) {
  if (!keysExactly(pointer, POINTER_KEYS)) fail("MANUAL_RESEARCH_POINTER_FIELDS_INVALID");
  if (pointer.schema !== MANUAL_RESEARCH_SCHEMA) fail("MANUAL_RESEARCH_SCHEMA_INVALID");
  if (!ID.test(pointer.reference_id) || !SHA.test(pointer.reference_sha256)) fail("MANUAL_RESEARCH_HASH_INVALID");
  if (!CATEGORIES.has(pointer.category) || !TOPICS[pointer.category].has(pointer.topic_code)) {
    fail("MANUAL_RESEARCH_CATEGORY_TOPIC_INVALID");
  }
  if (pointer.country_iso3 !== null &&
      (typeof pointer.country_iso3 !== "string" || !/^[A-Z]{3}$/.test(pointer.country_iso3))) {
    fail("MANUAL_RESEARCH_COUNTRY_INVALID");
  }
  if (pointer.source_kind !== "PUBLIC_TELEGRAM_MANUALLY_VIEWED" ||
      pointer.reference_registered !== true || pointer.human_reference_attested !== true ||
      pointer.source_native_time_independently_verified !== false ||
      pointer.automated_collection_authorized !== false ||
      pointer.has_source_message_payload !== false ||
      pointer.verification_status !== "UNVERIFIED" ||
      pointer.editorial_status !== "PENDING_INDEPENDENT_RESEARCH" ||
      pointer.scoring_eligible !== false || pointer.commercial_eligible !== false ||
      pointer.public_published !== false) {
    fail("MANUAL_RESEARCH_BOUNDARY_VIOLATION");
  }
  const clock = now.valueOf();
  if (!Number.isFinite(clock)) fail("MANUAL_RESEARCH_CLOCK_INVALID");
  const published = isoUtc(pointer.source_native_published_at_claimed, "SOURCE_CLAIMED_TIME", clock);
  const observed = isoUtc(pointer.observed_at, "RESEARCH_OBSERVED_TIME", clock);
  if (published > observed + 5 * 60000) fail("MANUAL_RESEARCH_TIME_ORDER_INVALID");
  if (pointer.historical_reference !== (observed - published > 6 * 3600000)) {
    fail("MANUAL_RESEARCH_HISTORICAL_STATUS_INVALID");
  }
  return {
    reference_id: pointer.reference_id,
    reference_sha256: pointer.reference_sha256,
    category: pointer.category,
    country_iso3: pointer.country_iso3,
    topic_code: pointer.topic_code,
    source_native_published_at_claimed: pointer.source_native_published_at_claimed,
    research_observed_at: pointer.observed_at,
    historical_reference: pointer.historical_reference,
  };
}
function checkOfficialUrl(value) {
  if (typeof value !== "string" || value.length > 2048) fail("OFFICIAL_SOURCE_URL_INVALID");
  let url;
  try { url = new URL(value); } catch { fail("OFFICIAL_SOURCE_URL_INVALID"); }
  const host = url.hostname.toLowerCase();
  const forbidden = ["t.me", "telegram.me", "telegram.org", "localhost"];
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || url.hash || !host.includes(".") ||
      forbidden.some((d) => host === d || host.endsWith("." + d)) ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith("[") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) {
    fail("OFFICIAL_SOURCE_URL_INVALID");
  }
  return url.href;
}

export function buildInternalResearchReviewPacket(input, now = new Date()) {
  if (!keysExactly(input, INPUT_KEYS) ||
      input.schema !== CORROBORATION_PACKET_SCHEMA ||
      input.human_review_requested !== true) fail("REVIEW_PACKET_INPUT_INVALID");
  const pointer = verifyInternalResearchPointer(input.research_pointer, now);
  const evidence = input.official_evidence_candidates;
  if (!Array.isArray(evidence) || evidence.length > 6) fail("OFFICIAL_CANDIDATES_INVALID");
  const families = new Set();
  const urls = new Set();
  const claims = evidence.map((row) => {
    if (!keysExactly(row, EVIDENCE_KEYS) || typeof row.publisher_family_claim !== "string" ||
        !FAMILY.test(row.publisher_family_claim)) fail("OFFICIAL_CANDIDATE_FIELDS_INVALID");
    const url = checkOfficialUrl(row.original_publisher_url);
    const family = row.publisher_family_claim;
    const publishedAt = isoUtc(row.published_at_claimed, "OFFICIAL_SOURCE_CLAIMED_TIME", now.valueOf());
    if (families.has(family) || urls.has(url)) fail("OFFICIAL_CANDIDATE_DUPLICATE_FAMILY_OR_URL");
    families.add(family); urls.add(url);
    return {
      claimed_publisher_family: family,
      original_publisher_url: url,
      published_at_claimed: new Date(publishedAt).toISOString(),
      independently_fetched_and_verified: false,
      publisher_identity_verified: false,
      reuse_rights_verified: false,
    };
  });
  return {
    schema: CORROBORATION_PACKET_SCHEMA,
    private_internal_research_only: true,
    research_pointer: pointer,
    official_evidence_candidates: claims,
    claimed_distinct_publisher_families: families.size,
    status: "PENDING_INDEPENDENT_FACT_CHECK",
    corroboration_verified: false,
    independent_publisher_ownership_verified: false,
    reviewer_final_approval: false,
    original_article_dates_verified: false,
    source_rights_verified: false,
    source_native_time_independently_verified: false,
    scoring_eligible: false,
    signing_eligible: false,
    commercial_eligible: false,
    public_published: false,
    x402_chargeable: false,
    created_at: now.toISOString(),
    packet_sha256: sha256(JSON.stringify({pointer, claims})),
    note: "Research planning only: every official publisher, original article time, evidence independence and reuse right must be verified separately.",
  };
}
