/**
 * Read-only acceptance contract for the PUBLIC unscored Ask news tier.
 * The publisher's original publication clock is NOT the response generation
 * time. Never treat publisher observation as signed/verified GRO evidence.
 * No raw answer, publisher name, URL or upstream payload is logged.
 */
const HASH = /^[a-f0-9]{40}$/u;
const DAY = 86_400_000;
const EMBARGO = 900_000;

export function inspectPublishedBuild(marker, expectedSha) {
  const actual = String(marker?.canonical_main_sha ?? "").toLowerCase();
  const expected = String(expectedSha ?? "").toLowerCase();
  const good = HASH.test(expected) && HASH.test(actual) && actual === expected;
  return { ok: good, expected_sha: expected, observed_sha: HASH.test(actual) ? actual : null,
    status: good ? "EXACT_PUBLISHED_SHA" : "PUBLISHED_SHA_MISMATCH_OR_INVALID" };
}

export function inspectUnscoredAsk(body, category, now = Date.now()) {
  const data = body?.data;
  const basic = body?.ok === true && data && typeof data === "object" &&
    !Array.isArray(data);
  if (!basic) return { category, ok: false, status: "ASK_RESULT_UNAVAILABLE" };
  // Missing/old publisher evidence must never produce a false positive.
  if (data.intelligence_tier !== "official_observation_unscored") {
    return { category, ok: false, status: "NO_CURRENT_UNSCORED_OFFICIAL_RELEASE",
      insufficient_evidence: data.insufficient_evidence === true };
  }
  const original = Date.parse(String(data.latest_original_published_at ?? ""));
  const validOriginal = Number.isFinite(original) &&
    original <= now - EMBARGO && original >= now - DAY;
  const evidence = Array.isArray(data.evidence) ? data.evidence : [];
  const safeEvidence = evidence.length > 0 && evidence.length <= 3 &&
    evidence.every(row => typeof row?.eventId === "string" &&
      /^live:official:(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(row.eventId) &&
      typeof row.title === "string" && row.title.startsWith("Geomacro finds ") &&
      row.title.length <= 280);
  const noRaw = !/(?:https?:\/\/|www\.|source_url|publisher_name|raw_payload)/iu
    .test(JSON.stringify(data));
  const validProse = ["summary", "what_changed", "why_it_matters", "geomacro_view"]
    .every(key => typeof data[key] === "string" && data[key].trim().length > 10);
  const valid = validOriginal && safeEvidence && noRaw && validProse &&
    data.insufficient_evidence === false && data.low_confidence === true &&
    data.gri === null && data.mean_relevance === null &&
    data.signed_gro_generated === false &&
    data.independent_same_event_verification === false &&
    data.source_identity_exposed === false &&
    data.durable_live_storage_write === false &&
    data.data_mode === "ephemeral_live";
  return { category, ok: valid, status: valid ? "CURRENT_OFFICIAL_UNSCORED_ONLY"
    : "UNSCORED_RESPONSE_CONTRACT_INVALID",
    original_clock_valid: validOriginal, safe_evidence: safeEvidence,
    source_private: noRaw, risk_signing_not_claimed: data.signed_gro_generated === false,
    evidence_count: evidence.length };
}
