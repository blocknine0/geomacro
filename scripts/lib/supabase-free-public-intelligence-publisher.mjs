// Publication adapter only: existing signed-event qualification and D1
// admission remain authoritative. No discovery, scoring or payment engine.
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { qualifyIndependentSameEvent } from "./independent-same-event-qualification.mjs";
import { validateHotSnapshot } from "../../workers/control-plane/src/index.mjs";

const LIVE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

export async function publishSupabaseFreePublicIntelligence({
  rows, eventPackages, trustedReviewerPublicKeyPem, sourceRunId,
  createArchiveClient, promoteHotSnapshot, clock = () => new Date(),
}) {
  // Copy the complete input before any await; caller mutation cannot change
  // the exact signed customer bytes between admission, B2 and D1 readback.
  const input = JSON.parse(JSON.stringify({ rows, eventPackages }));
  const now = clock();
  const value = {
    schema: "geomacro.public-intelligence-live.v1",
    source_project: "ldpwajisioljyjtojvfx", // legacy schema identity, no DB use
    generated_at: now.toISOString(), rows: input.rows,
  };
  const qualification = qualifyIndependentSameEvent({
    ...input, now, trustedReviewerPublicKeyPem,
  });
  const raw = Buffer.from(JSON.stringify(value));
  const packed = gzipSync(raw, { level: 9 });
  const digest = sha(packed);
  const proof = {
    schema: "geomacro.public-intelligence-live-proof.v1",
    source_project: value.source_project,
    generated_at: value.generated_at, live_key: LIVE_KEY,
    current_source_id: "qualified_independent_original_publishers_v1",
    current_evidence_contract: "geomacro.qualified-original-event-claims.v1",
    current_source_batch_at: new Date(Math.max(...input.rows.map(row =>
      Date.parse(row.published_at)))).toISOString(),
    compressed_sha256: digest, compressed_bytes: packed.length,
    commercial_multi_source_verified: true,
    commercial_multi_source_checked_at: now.toISOString(),
    commercial_multi_source_receipt_sha256: qualification.receipt_sha256,
    commercial_multi_source_qualified_count: input.rows.length,
    row_count: input.rows.length, verified_scored_rows: input.rows.length,
    live_observed_rows: 0, raw_source_headlines_exposed: false,
    provider_identity_exposed: false, synthetic_score: false,
  };
  const admit = at => validateHotSnapshot({
    value, proof: { ...proof, full_b2_readback_verified: true,
      exact_gzip_restore_verified: true },
    payload_sha256: sha(raw), source_run_id: sourceRunId,
  }, "intelligence", at.getTime());
  // Pure preflight uses the SAME edge admission (including derived-only
  // allowlist, three domains, original clock, size and run ID) before any
  // client creation, quota reservation or B2 request. These prospective
  // readback flags are never persisted until actual byte verification below.
  admit(now);
  // One PRIVATE content-addressed bundle contains all three domains, exact
  // customer bytes, signed review packages and the source-free admission
  // receipt. Restore/replay needs one Class-B GET, not one GET per row or
  // per-domain private review object. Public latest remains derived-only.
  const archiveRaw = Buffer.from(JSON.stringify({
    schema: "geomacro.private-qualified-intelligence-bundle.v1",
    value, private_event_packages: input.eventPackages,
    admission_receipt: qualification.receipt,
    admission_receipt_sha256: qualification.receipt_sha256,
    public_payload_sha256: sha(raw),
    public_gzip_sha256: digest,
  }));
  if (archiveRaw.length > 2 * 1024 * 1024)
    throw new Error("SUPABASE_FREE_INTELLIGENCE_PRIVATE_BUNDLE_TOO_LARGE");
  const archivePacked = gzipSync(archiveRaw, { level: 9 });
  const archiveDigest = sha(archivePacked);
  const historyKey = `geomacro-evidence/v1/private/qualified-intelligence-bundles/${archiveDigest}.json.gz`;
  const b2 = createArchiveClient();
  async function putAndVerify(key, bytes) {
    await b2.put(key, bytes);
    const readback = await b2.get(key);
    if (!Buffer.from(readback).equals(bytes))
      throw new Error("SUPABASE_FREE_INTELLIGENCE_B2_READBACK_MISMATCH");
    return Buffer.from(readback);
  }
  // Keep a durable content-addressed recovery copy before replacing latest.
  const historical = await putAndVerify(historyKey, archivePacked);
  if (!gunzipSync(historical).equals(archiveRaw))
    throw new Error("SUPABASE_FREE_INTELLIGENCE_GZIP_RESTORE_MISMATCH");
  admit(clock());
  const live = await putAndVerify(LIVE_KEY, packed);
  if (!gunzipSync(live).equals(raw))
    throw new Error("SUPABASE_FREE_INTELLIGENCE_GZIP_RESTORE_MISMATCH");
  proof.full_b2_readback_verified = true;
  proof.exact_gzip_restore_verified = true;
  admit(clock());
  await putAndVerify(PROOF_KEY, Buffer.from(JSON.stringify(proof)));
  // Recheck signed evidence and all native deadlines after actual network
  // work. An old receipt cannot be made current by a slow upload/retry.
  qualifyIndependentSameEvent({ ...input, now: clock(), trustedReviewerPublicKeyPem });
  admit(clock());
  await promoteHotSnapshot({ product: "intelligence", value, proof,
    privateEventPackages: input.eventPackages });
  return { ok: true, source_as_of: proof.current_source_batch_at,
    payload_sha256: sha(raw), b2_sha256: digest,
    full_b2_readback_verified: true, exact_gzip_restore_verified: true,
    d1_hot_snapshot_published: true, supabase_reads: 0, supabase_writes: 0,
    private_bundle_sha256: archiveDigest,
    successful_b2_readback_gets: 3, private_bundle_restore_gets: 1,
    external_payment_executed: false };
}
