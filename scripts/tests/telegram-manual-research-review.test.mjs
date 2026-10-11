import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MANUAL_RESEARCH_SCHEMA, CORROBORATION_PACKET_SCHEMA,
  verifyInternalResearchPointer, buildInternalResearchReviewPacket,
} from "../verify-telegram-manual-research-review.mjs";

const NOW = new Date("2026-10-12T12:00:00Z");
function pointer() {
  return {
    schema: MANUAL_RESEARCH_SCHEMA,
    reference_id: "tgresearch_" + "a".repeat(32),
    reference_sha256: "b".repeat(64),
    category: "GEOPOLITICS",
    topic_code: "SANCTIONS",
    country_iso3: "USA",
    source_native_published_at_claimed: "2026-10-12T11:00:00Z",
    observed_at: "2026-10-12T11:05:00Z",
    historical_reference: false,
    source_kind: "PUBLIC_TELEGRAM_MANUALLY_VIEWED",
    reference_registered: true,
    human_reference_attested: true,
    source_native_time_independently_verified: false,
    automated_collection_authorized: false,
    has_source_message_payload: false,
    verification_status: "UNVERIFIED",
    editorial_status: "PENDING_INDEPENDENT_RESEARCH",
    scoring_eligible: false,
    commercial_eligible: false,
    public_published: false,
  };
}
function packet() {
  return {
    schema: CORROBORATION_PACKET_SCHEMA,
    human_review_requested: true,
    research_pointer: pointer(),
    official_evidence_candidates: [
      { publisher_family_claim: "central-bank-gov", original_publisher_url: "https://centralbank.example/news/123", published_at_claimed: "2026-10-12T11:10:00Z" },
      { publisher_family_claim: "treasury-gov", original_publisher_url: "https://treasury.example/press/456", published_at_claimed: "2026-10-12T11:20:00Z" },
    ],
  };
}
test("valid research pointer becomes separate non-commercial private review packet", () => {
  const r = buildInternalResearchReviewPacket(packet(), NOW);
  assert.equal(r.status, "PENDING_INDEPENDENT_FACT_CHECK");
  assert.equal(r.private_internal_research_only, true);
  assert.equal(r.claimed_distinct_publisher_families, 2);
  assert.equal(r.official_evidence_candidates.length, 2);
  for (const k of ["corroboration_verified", "independent_publisher_ownership_verified",
    "reviewer_final_approval", "original_article_dates_verified", "source_rights_verified",
    "source_native_time_independently_verified", "scoring_eligible", "signing_eligible",
    "commercial_eligible", "public_published", "x402_chargeable"]) {
    assert.equal(r[k], false, k);
  }
  assert.ok(r.packet_sha256.match(/^[a-f0-9]{64}$/));
  assert.deepEqual(buildInternalResearchReviewPacket(packet(), NOW), r);
  const text = JSON.stringify(r);
  for (const forbidden of ["t.me/", "TELEGRAM_API_HASH", "telegram_session", "raw_payload", "message_text"]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
});
test("explicitly no candidate can still be a pending research packet, never verified", () => {
  const p = packet();
  p.official_evidence_candidates = [];
  const r = buildInternalResearchReviewPacket(p, NOW);
  assert.equal(r.claimed_distinct_publisher_families, 0);
  assert.equal(r.corroboration_verified, false);
});
test("all input and pointer fields must be exactly whitelisted", () => {
  const bad = ["raw_message", "headline", "message_text", "media", "source_url", "telegram_session", "customer_query", "commercial_eligible"];
  for (const extra of bad) {
    const p = packet();p.research_pointer[extra] = "raw";
    const expected = extra === "commercial_eligible" ? /MANUAL_RESEARCH_BOUNDARY_VIOLATION/ : /MANUAL_RESEARCH_POINTER_FIELDS_INVALID/;
    assert.throws(() => buildInternalResearchReviewPacket(p, NOW), expected);
  }
  const p = packet();p.raw_data = "secret";
  assert.throws(() => buildInternalResearchReviewPacket(p, NOW), /REVIEW_PACKET_INPUT_INVALID/);
});
test("pointer fields cannot be promoted by untrusted input", () => {
  for (const [key, value] of Object.entries({
    source_kind: "TELEGRAM_SCRAPED", reference_registered: false, human_reference_attested: false,
    source_native_time_independently_verified: true, automated_collection_authorized: true,
    has_source_message_payload: true, verification_status: "VERIFIED",
    editorial_status: "APPROVED", scoring_eligible: true,
    commercial_eligible: true, public_published: true,
  })) {
    const p = pointer();p[key] = value;
    assert.throws(() => verifyInternalResearchPointer(p, NOW), /MANUAL_RESEARCH_BOUNDARY_VIOLATION/, key);
  }
});
test("timestamp age, future time and historical label must agree", () => {
  const a = pointer();a.historical_reference = true;
  assert.throws(() => verifyInternalResearchPointer(a, NOW), /MANUAL_RESEARCH_HISTORICAL_STATUS_INVALID/);
  const b = pointer();b.source_native_published_at_claimed = "2026-10-13T00:00:00Z";
  assert.throws(() => verifyInternalResearchPointer(b, NOW), /SOURCE_CLAIMED_TIME_INVALID/);
  const c = pointer();c.observed_at = "2026-10-12T10:00:00Z";
  assert.throws(() => verifyInternalResearchPointer(c, NOW), /MANUAL_RESEARCH_TIME_ORDER_INVALID/);
  const d = pointer();d.observed_at = "2026-10-12T11:05:00";
  assert.throws(() => verifyInternalResearchPointer(d, NOW), /RESEARCH_OBSERVED_TIME_INVALID/);
  const e = pointer();e.source_native_published_at_claimed = "2026-10-10T11:00:00Z";e.historical_reference = true;
  assert.equal(verifyInternalResearchPointer(e, NOW).historical_reference, true);
});
test("reject wrong domain, topic, hash, country, and claimed timestamps", () => {
  let p = pointer();p.topic_code = "INFLATION";
  assert.throws(() => verifyInternalResearchPointer(p, NOW), /CATEGORY_TOPIC_INVALID/);
  p = pointer();p.reference_id = "tgresearch_fake";
  assert.throws(() => verifyInternalResearchPointer(p, NOW), /HASH_INVALID/);
  p = pointer();p.country_iso3 = "GB";
  assert.throws(() => verifyInternalResearchPointer(p, NOW), /COUNTRY_INVALID/);
  p = packet();p.official_evidence_candidates[0].published_at_claimed = "2027-01-01T00:00:00Z";
  assert.throws(() => buildInternalResearchReviewPacket(p, NOW), /OFFICIAL_SOURCE_CLAIMED_TIME_INVALID/);
});
test("official evidence must be non-Telegram public HTTPS URLs, no private host or credentials", () => {
  for (const url of [
    "https://t.me/example_public/123", "https://telegram.org/a", "http://gov.example/story",
    "https://127.0.0.1/a", "https://192.168.1.1/story",
    "https://localhost/story", "https://internal.local/a",
    "https://user:password@gov.example/story", "https://gov.example/story#raw", "javascript:alert(1)",
  ]) {
    const p = packet();p.official_evidence_candidates[0].original_publisher_url = url;
    assert.throws(() => buildInternalResearchReviewPacket(p, NOW), /OFFICIAL_SOURCE_URL_INVALID/, url);
  }
});
test("claimed publisher family identity may not be double-counted", () => {
  let p = packet();
  p.official_evidence_candidates[1].publisher_family_claim = "central-bank-gov";
  assert.throws(() => buildInternalResearchReviewPacket(p, NOW), /OFFICIAL_CANDIDATE_DUPLICATE_FAMILY_OR_URL/);
  p = packet();
  p.official_evidence_candidates[1].original_publisher_url = p.official_evidence_candidates[0].original_publisher_url;
  assert.throws(() => buildInternalResearchReviewPacket(p, NOW), /OFFICIAL_CANDIDATE_DUPLICATE_FAMILY_OR_URL/);
});
test("candidate free-text and extra fields rejected", () => {
  const p = packet();p.official_evidence_candidates[0].headline = "copy of Telegram text";
  assert.throws(() => buildInternalResearchReviewPacket(p, NOW), /OFFICIAL_CANDIDATE_FIELDS_INVALID/);
});
test("local CLI writes owner-only file and never overwrites or logs reference", () => {
  const dir = mkdtempSync(join(tmpdir(), "geomacro-manual-"));
  try {
    const now = Date.now();
    const input = packet();
    const observed = new Date(now - 10 * 60000).toISOString();
    const claimed = new Date(now - 20 * 60000).toISOString();
    input.research_pointer.source_native_published_at_claimed = claimed;
    input.research_pointer.observed_at = observed;
    input.official_evidence_candidates[0].published_at_claimed = claimed;
    input.official_evidence_candidates[1].published_at_claimed = claimed;
    const inputFile = join(dir,"input.json");
    const outputFile = join(dir,"review.json");
    writeFileSync(inputFile, JSON.stringify(input));
    const script = resolve("scripts/build-telegram-manual-research-review.mjs");
    const run = () => spawnSync(process.execPath,[script,"--input",inputFile,"--output",outputFile],{encoding:"utf8"});
    const first = run();
    assert.equal(first.status,0,first.stderr);
    assert.match(first.stdout,/NOT_PUBLISHED/);
    assert.equal(first.stdout.includes("tgresearch_"),false);
    assert.equal(existsSync(outputFile),true);
    if (process.platform !== "win32") assert.equal(statSync(outputFile).mode & 0o777,0o600);
    const output = JSON.parse(readFileSync(outputFile,"utf8"));
    assert.equal(output.x402_chargeable,false);
    assert.equal(output.signing_eligible,false);
    const second=run();
    assert.notEqual(second.status,0);
    assert.equal(second.stderr.includes("tgresearch_"),false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
