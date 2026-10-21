/**
 * Supabase-free public GRI v1.2 bridge.
 * Requires current, separately Ed25519-reviewed *canonical scored* originals
 * and an exact B2-readback verified, independently signed historical anchor.
 * Never turns the existing PRIVATE offline proof into a public authority.
 */
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import {
  calculateGri, canonicalJson, GRI_CATEGORIES, GRI_METHOD_VERSION,
  GRI_STORY_CORRELATION_VERSION, GRI_STORY_CORRELATION_PROMPT_VERSION,
} from "./gri-engine-v12.js";
import { GRI_DISPOSITION, buildSourceDisposition } from "./gri-disposition-v12.js";
import { reviewedNumericalGriDelta } from "./gri-reviewed-numerical-delta.mjs";
import { appendVerifiedGriHistory } from "./gri-v12-b2-immutable-history-chain.mjs";
import {reviewedGriPortfolioProfile,GRI_RETAINED_MAX_AGE_MS} from "./gri-reviewed-source-window.mjs";
import { buildPortableGriProofBundle, verifyPortableGriProofBundle } from "./gri-portable-proof-v12.js";
import { qualifyIndependentSameEvent } from "./independent-same-event-qualification.mjs";
import { assemblePublicGlobalRisk } from "../../src/lib/global-risk-assemble.ts";
import { validateGlobalRiskContinuity } from "../../src/lib/global-risk-continuity.ts";
import { assertCurrentGlobalRiskSourceForHotPublish } from "./global-risk-hot-source-preflight.mjs";

export const REVIEWED_GRI_INPUT_SCHEMA = "geomacro.gri-v12-reviewed-current-input.v1";
const HISTORY_SCHEMA = "geomacro.public-global-risk-history.v1";
const PROJECT = "ldpwajisioljyjtojvfx";
const SHA = /^[a-f0-9]{64}$/u;
const MAX_AGE = 90 * 60_000;
const FUTURE_SKEW = 5 * 60_000;
const CATEGORIES = new Set(GRI_CATEGORIES);
const HISTORY_PREFIX = "geomacro-evidence/v1/history/global-risk/gri-v1.2.0/";
const assert = (ok, code) => { if (!ok) throw new Error("GRI_PUBLIC_" + code); };
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function trustedSignature(input, signature, pem) {
  assert(typeof signature === "string" && /^[A-Za-z0-9+/]{86}==$/u.test(signature),
    "REVIEW_SIGNATURE_REQUIRED");
  let key;
  try { key = createPublicKey(pem); } catch { throw new Error("GRI_PUBLIC_REVIEWER_KEY_INVALID"); }
  assert(key.asymmetricKeyType === "ed25519" &&
    verifySignature(null, Buffer.from(JSON.stringify(input)), key,
      Buffer.from(signature, "base64")), "REVIEW_SIGNATURE_INVALID");
  return digest(key.export({ format: "der", type: "spki" }));
}

function immutableSnapshotId(proofHash) {
  assert(SHA.test(proofHash), "PROOF_HASH_INVALID");
  // A deterministic identifier for these exact canonical bytes, not a new
  // calculated score, historical bucket, original publication time or GRO.
  return [
    proofHash.slice(0, 8), proofHash.slice(8, 12),
    "4" + proofHash.slice(13, 16), "8" + proofHash.slice(17, 20),
    proofHash.slice(20, 32),
  ].join("-");
}

function assertHistoricalArchive(history, signedInput, readbackSha) {
  assert(SHA.test(readbackSha) && readbackSha === signedInput.history_b2_sha256,
    "HISTORY_SIGNED_B2_READBACK_HASH_MISMATCH");
  assert(typeof signedInput.history_b2_key === "string" &&
    signedInput.history_b2_key.startsWith(HISTORY_PREFIX) &&
    /^[a-zA-Z0-9/_.-]+\.json\.gz$/u.test(signedInput.history_b2_key) &&
    !signedInput.history_b2_key.includes(".."), "HISTORY_KEY_INVALID");
  assert(history?.schema === HISTORY_SCHEMA &&
    history.source_project === PROJECT &&
    history.methodology_version === GRI_METHOD_VERSION &&
    Array.isArray(history.verified_snapshot_rows) &&
    history.verified_snapshot_rows.length >= 2 &&
    history.verified_snapshot_rows.length <= 1000 &&
    history.data?.verificationStatus === "verified" &&
    history.data?.snapshotId === history.snapshot_id &&
    history.data?.snapshotAsOf === history.snapshot_as_of,
  "HISTORY_ARCHIVE_CONTRACT_INVALID");
  const past = Date.parse(history.snapshot_as_of);
  assert(Number.isFinite(past) &&
    history.verified_snapshot_rows[0]?.id === history.snapshot_id &&
    history.verified_snapshot_rows[0]?.as_of === history.snapshot_as_of &&
    history.verified_snapshot_rows.every(row =>
      row.status === "published" && row.verification_status === "verified" &&
      row.methodology_version === GRI_METHOD_VERSION &&
      Number.isFinite(Date.parse(row.as_of)) && Date.parse(row.as_of) <= past),
  "HISTORY_UNVERIFIED_OR_RELABELED");
  // A two-row list is not multi-snapshot history if both records point to
  // the SAME version or same source-native clock. The B2 SHA pins the entire
  // archive, but does not itself prove distinct historical snapshots.
  const historicalIds = new Set();
  let priorAsOf = Infinity;
  for (const row of history.verified_snapshot_rows) {
    const clock = Date.parse(row.as_of);
    assert(typeof row.id === "string" && row.id.length >= 8 &&
      !historicalIds.has(row.id) &&
      Number.isFinite(clock) && clock < priorAsOf,
    "HISTORY_MULTI_SNAPSHOT_DISTINCT_LINEAGE_REQUIRED");
    historicalIds.add(row.id);
    priorAsOf = clock;
  }
  // Judge historical continuity at its *original* timestamp, never now.
  // A historical proof is not a current proof.
  const verification = validateGlobalRiskContinuity(history.data, past);
  assert(verification.ok === true, "HISTORY_CONTINUITY_" + verification.code);
  return history.verified_snapshot_rows;
}

function checkReviewedInput(signed, nowMs) {
  assert(signed?.schema === REVIEWED_GRI_INPUT_SCHEMA &&
    signed.private_only === false &&
    signed.publication_review_authorized === true &&
    signed.original_sources_independently_verified === true &&
    signed.canonical_scoring_and_story_reviewed === true &&
    signed.commercial_derived_rights_verified === true &&
    signed.historical_lineage_reviewed === true &&
    Array.isArray(signed.events) && signed.events.length >= 3 &&
    signed.events.length <= 80 &&
    Array.isArray(signed.customerRows) &&
    Array.isArray(signed.eventPackages) &&
    signed.events.length === signed.customerRows.length &&
    signed.events.length === signed.eventPackages.length,
  "REVIEWED_CURRENT_INPUT_REQUIRED");
  const retained=reviewedGriPortfolioProfile(signed);
  const originalWindow=retained?GRI_RETAINED_MAX_AGE_MS:MAX_AGE;
  const at = Date.parse(signed.as_of);
  const reviewedAt = Date.parse(signed.reviewed_at);
  assert(Number.isFinite(at) && Number.isFinite(reviewedAt) &&
    at <= nowMs + FUTURE_SKEW && nowMs - at <= MAX_AGE &&
    reviewedAt >= at && reviewedAt <= nowMs + FUTURE_SKEW &&
    nowMs - reviewedAt <= MAX_AGE, "REVIEW_CLOCK_STALE_OR_FUTURE");
  assertCurrentGlobalRiskSourceForHotPublish(signed.as_of, nowMs);
  const byId = new Map();
  const latest = new Map();
  for (const event of signed.events) {
    assert(typeof event?.id === "string" && !byId.has(event.id) &&
      CATEGORIES.has(event.category) &&
      Number.isInteger(event.severity) && event.severity >= 0 &&
      event.severity <= 100 &&
      Number.isInteger(event.confidence) && event.confidence > 0 &&
      event.confidence <= 100 &&
      typeof event.story_cluster_id === "string" &&
      event.story_cluster_id.length >= 4 &&
      !event.story_cluster_id.startsWith("private-singleton:") &&
      typeof event.classification_input_hash === "string" &&
      SHA.test(event.classification_input_hash) &&
      typeof event.story_clustering_input_hash === "string" &&
      SHA.test(event.story_clustering_input_hash),
    "UNREVIEWED_EVENT_OR_PRIVATE_SINGLETON");
    const original = Date.parse(event.published_at);
    const observed = Date.parse(event.created_at);
    assert(Number.isFinite(original) && Number.isFinite(observed) &&
      original <= observed && observed <= at &&
      original <= nowMs + FUTURE_SKEW && nowMs - original <= originalWindow &&
      nowMs - observed <= originalWindow,
    "EVENT_ORIGINAL_TIME_STALE_OR_INVALID");
    byId.set(event.id, event);
    latest.set(event.category, Math.max(latest.get(event.category) ?? 0, original));
  }
  assert(GRI_CATEGORIES.every(category =>
    latest.has(category) && nowMs - latest.get(category) <= originalWindow),
  "THREE_DOMAIN_ORIGINAL_FRESHNESS_MISSING");
  // An unchanged reviewed baseline may be retained within canonical GRI 72h
  // recency decay, but at least ONE real source-native original must have
  // arrived within 90 minutes. No rescore solely by advancing reviewed_at.
  if(retained)assert([...latest.values()].some(at=>nowMs-at<=MAX_AGE),
    "RETAINED_PORTFOLIO_NO_NEW_ORIGINAL_EVENT");
  const seen = new Set();
  for (const row of signed.customerRows) {
    const event = byId.get(row?.id);
    assert(event && !seen.has(row.id) &&
      row.category === event.category &&
      row.severity === event.severity &&
      row.created_at === event.created_at &&
      row.published_at === event.published_at,
    "SIGNED_CUSTOMER_ROW_TO_CANONICAL_SCORE_MISMATCH");
    seen.add(row.id);
  }
  return at;
}

/**
 * No network/credentials/publishing in this function. The caller supplies
 * *actual* B2 restored historical data, its readback SHA and a previously
 * approved independent review public key, never a caller-selected key.
 */
export function computeReviewedCurrentGlobalRisk({
  reviewed, history, verifiedHistoryB2Sha256,
  trustedReviewerPublicKeyPem, now = new Date(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  assert(Number.isFinite(nowMs), "CLOCK_INVALID");
  const input = reviewed?.signed_input;
  assert(input && typeof input === "object" &&
    Object.keys(reviewed).length === 2 &&
    Object.keys(reviewed).every(k => ["signed_input", "review_signature_base64"].includes(k)),
  "SIGNED_ENVELOPE_REQUIRED");
  // Reject private-only or historical stand-ins BEFORE creating an archive
  // client or issuing any B2 request in the caller.
  // Authenticate the *entire* reviewed envelope before interpreting any
  // current score, source clock or story lineage as trusted information.
  const reviewerSpkiSha256 = trustedSignature(input,
    reviewed.review_signature_base64, trustedReviewerPublicKeyPem);
  const at = checkReviewedInput(input, nowMs);
  const qualified = qualifyIndependentSameEvent({
    rows: input.customerRows,
    eventPackages: input.eventPackages,
    now, trustedReviewerPublicKeyPem,
    griRetainedPortfolio:reviewedGriPortfolioProfile(input),
  });
  assert(qualified.receipt.qualified_event_count === input.events.length &&
    qualified.receipt.commercial_event_admission === true,
  "SIGNED_ORIGINAL_EVIDENCE_NOT_QUALIFIED");
  const historicalRows = assertHistoricalArchive(history, input, verifiedHistoryB2Sha256);
  assert(Date.parse(historicalRows[0].as_of) < at, "HISTORY_NOT_PRIOR_TO_CURRENT");
  // A source published before the prior verified GRI snapshot cannot be
  // replayed as new risk by merely advancing review/as_of timestamps.
  const previousSnapshotAt=Date.parse(historicalRows[0].as_of);
  const newlyObservedOriginals=input.events.filter(event=>{
    const original=Date.parse(event.published_at);
    return Number.isFinite(original)&&original>previousSnapshotAt&&
      original<=at&&nowMs-original<=MAX_AGE;
  });
  assert(newlyObservedOriginals.length>0,
    "NO_NEW_ORIGINAL_AFTER_VERIFIED_HISTORICAL_SNAPSHOT");

  // Existing unchanged v1.2 canonical scoring, disposition and portable
  // replay verifier. No synthetic scores or guessed cross-run attribution.
  const calculation = calculateGri(input.events, new Date(at));
  assert(calculation.methodologyVersion === GRI_METHOD_VERSION &&
    calculation.coverage === 1 &&
    calculation.eventCount === input.events.length &&
    GRI_CATEGORIES.every(c => calculation.categories.some(row => row.category === c)),
  "CANONICAL_SCORING_INCOMPLETE");
  const byId = new Map(input.events.map(event => [event.id, event]));
  const dispositions = calculation.contributions.map(contribution =>
    buildSourceDisposition({
      event: byId.get(contribution.eventId), contribution,
      disposition: GRI_DISPOSITION.INCLUDED, classificationSource: "direct",
    }));
  assert(dispositions.length === input.events.length, "DISPOSITION_INCOMPLETE");
  const portable = buildPortableGriProofBundle({
    currentCalculation: calculation, previousCalculation: null, dispositions,
  });
  const verified = verifyPortableGriProofBundle(portable, {
    expectedProofHash: portable.proof.proofHash,
  });
  assert(verified.valid === true && verified.internallyReproducible === true &&
    verified.authenticAgainstExpectedHash === true,
  "PORTABLE_PROOF_REPRODUCTION_FAILED");
  const p = portable.proof;
  const snapshotId = immutableSnapshotId(p.proofHash);
  // Genuine signed input -> canonical v1.2 score -> verified previous B2
  // historical score. A triage-only news item can NEVER pass this stage.
  const movement = reviewedNumericalGriDelta(calculation,historicalRows);
  const latest = {
    id: snapshotId, as_of: new Date(at).toISOString(),
    methodology_version: GRI_METHOD_VERSION,
    methodology_hash: p.methodologyHash, input_hash: p.inputHash,
    evidence_hash: p.evidenceHash, calculation_hash: p.calculationHash,
    disposition_hash: p.dispositionHash, candidate_event_count: input.events.length,
    proof_version: portable.proofVersion, proof_hash: p.proofHash,
    verification_status: "verified",
    reconciliation_residual: p.reconciliationResidual,
    change_residual: p.changeResidual,
    raw_score: calculation.rawScore, display_score: calculation.displayScore,
    coverage: calculation.coverage, weighted_confidence: calculation.weightedConfidence,
    active_categories: calculation.activeCategories,
    event_count: calculation.eventCount, source_count: calculation.sourceCount,
    independent_story_count: calculation.independentStoryCount,
    story_correlation_version: GRI_STORY_CORRELATION_VERSION,
    story_correlation_prompt_version: GRI_STORY_CORRELATION_PROMPT_VERSION,
    category_breakdown: calculation.categories,
    previous_as_of: movement.previous_as_of,
    previous_raw_score: movement.previous_raw_score,
    previous_display_score: movement.previous_display_score,
    change_points: movement.change_points,
    change_hash: movement.change_hash,
    change_attribution: movement.change_attribution,
    // Explanation in private portable proof contains original article metadata.
    // Never serialize it into public D1/B2 projection.
    explanation: null, status: "published",
  };
  // Every valid new current snapshot extends the *exact SHA-pinned* previous
  // immutable B2 history. Keep a bounded hot view while older versions remain
  // recursively recoverable from each archived predecessor key and SHA.
  // Do not ever compute a new GRI by simply adding old and new numeric scores.
  const accumulatedHistory = appendVerifiedGriHistory({
    history, latest,
    priorHistoryKey: input.history_b2_key,
    verifiedPriorB2Sha256: verifiedHistoryB2Sha256,
  });
  const snapshotRows = accumulatedHistory.retainedRows;
  const risk = assemblePublicGlobalRisk(snapshotRows, [], at);
  const historicalRisk = assemblePublicGlobalRisk(snapshotRows, [], at);
  assert(risk.snapshotId === snapshotId && risk.proofHash === p.proofHash &&
    risk.recentEvents.length === 0 &&
    risk.drivers.every(row => row.topEvent === null),
  "PUBLIC_PROJECTION_PRIVATE_CONTENT");
  const continuity = validateGlobalRiskContinuity(risk, at);
  assert(continuity.ok === true, "CURRENT_CONTINUITY_" + continuity.code);
  const historyValue = {
    schema: HISTORY_SCHEMA,
    source_project: PROJECT,
    methodology_version: GRI_METHOD_VERSION,
    snapshot_id: snapshotId,
    snapshot_as_of: latest.as_of,
    verified_snapshot_rows: snapshotRows,
    lineage: accumulatedHistory.lineage,
    data: historicalRisk,
  };
  const liveValue = {
    schema: "geomacro.public-global-risk-live.v1",
    generated_at: now.toISOString(),
    source_project: PROJECT,
    history_key: HISTORY_PREFIX + snapshotId + ".json.gz",
    data: risk,
  };
  const reviewedInputSha256 = digest(Buffer.from(JSON.stringify(input)));
  return {
    liveValue, historyValue,
    reviewProof: {
      reviewed_input_sha256: reviewedInputSha256,
      reviewer_spki_sha256: reviewerSpkiSha256,
      review_signature_sha256: digest(Buffer.from(reviewed.review_signature_base64, "base64")),
      independent_original_receipt_sha256: qualified.receipt_sha256,
      historical_b2_sha256: verifiedHistoryB2Sha256,
      portable_proof_hash: p.proofHash,
      portable_bundle_hash: portable.bundleHash,
      historical_numeric_comparison:movement.comparison_method,
      new_native_original_after_historical_anchor_verified:true,
      newly_verified_original_count:newlyObservedOriginals.length,
      prior_verified_snapshot_at:historicalRows[0].as_of,
      verified_previous_snapshot_id:movement.verified_previous_snapshot_id,
      observed_numeric_delta_points:movement.change_points,
      numerical_change_not_event_attribution:true,
      history_append_only_b2_lineage_verified:true,
      previous_history_immutable_b2_sha256:verifiedHistoryB2Sha256,
      historical_snapshots_preserved_total:
        accumulatedHistory.lineage.total_verified_snapshots,
      history_rolling_view_limit:
        accumulatedHistory.lineage.hot_row_limit,
      historical_snapshots_in_older_immutable_b2_versions:
        accumulatedHistory.lineage.older_snapshots_in_pinned_b2_history,
      // Provenance-only: signed reviewer intentionally retained real
      // source-native events under the *unchanged* 72h v1.2 scoring formula.
      retained_source_portfolio_review:reviewedGriPortfolioProfile(input),
      source_lookback_hours:reviewedGriPortfolioProfile(input)?72:1.5,
    },
    portableProof: portable, // RETURNED PRIVATE: NEVER WRITE TO D1/PUBLIC B2
  };
}


/** Credentials-free preflight, before reserving a single B2 Class-B ticket. */
export function preflightReviewedCurrentGlobalRisk({
  reviewed, trustedReviewerPublicKeyPem, now = new Date(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  assert(Number.isFinite(nowMs), "CLOCK_INVALID");
  const signed = reviewed?.signed_input;
  assert(signed && typeof signed === "object" &&
    Object.keys(reviewed).length === 2 &&
    Object.keys(reviewed).every(k => ["signed_input","review_signature_base64"].includes(k)),
  "SIGNED_ENVELOPE_REQUIRED");
  const reviewer = trustedSignature(signed, reviewed.review_signature_base64,
    trustedReviewerPublicKeyPem);
  checkReviewedInput(signed, nowMs);
  const sourceQualification = qualifyIndependentSameEvent({
    rows: signed.customerRows, eventPackages: signed.eventPackages,
    now, trustedReviewerPublicKeyPem,
    griRetainedPortfolio:reviewedGriPortfolioProfile(signed),
  });
  assert(sourceQualification.receipt.qualified_event_count === signed.events.length &&
    sourceQualification.receipt.commercial_event_admission === true,
  "SIGNED_ORIGINAL_EVIDENCE_NOT_QUALIFIED");
  assert(typeof signed.history_b2_key === "string" &&
    signed.history_b2_key.startsWith(HISTORY_PREFIX) &&
    /^[a-zA-Z0-9/_.-]+\.json\.gz$/u.test(signed.history_b2_key) &&
    !signed.history_b2_key.includes("..") &&
    SHA.test(signed.history_b2_sha256), "HISTORY_PIN_REQUIRED");
  return {
    history_b2_key: signed.history_b2_key,
    history_b2_sha256: signed.history_b2_sha256,
    reviewer_spki_sha256: reviewer,
    reviewed_input_sha256: digest(Buffer.from(JSON.stringify(signed))),
    qualified_receipt_sha256: sourceQualification.receipt_sha256,
  };
}
