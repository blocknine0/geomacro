import { STAGE_DOMAINS, CANONICAL_CLASSIFIER_VERSION } from "./restricted-private-scored-stage.mjs";

const SHA_RE = /^[0-9a-f]{64}$/u;
const PREFIX = "geomacro-evidence/v1/private/restricted-current-scoring/";

export function verifyPrivateScoringD1Checkpoint(checkpoint, {
  b2Key,
  compressedSha256,
  counts,
  lastSuccessAt,
  sourceCompanion = null,
} = {}) {
  const cursor = checkpoint?.payload?.cursor;
  if (
    checkpoint?.source_id !== "orchestrator:private_stage" ||
    checkpoint?.payload?.source !== "geomacro_intelligence_orchestrator" ||
    checkpoint?.payload?.task !== "private_stage" ||
    cursor?.status !== "verified_private_staging" ||
    cursor?.publication_authorized !== false ||
    cursor?.classifier_version !== CANONICAL_CLASSIFIER_VERSION ||
    checkpoint?.last_success_at !== lastSuccessAt ||
    !Number.isFinite(Date.parse(String(lastSuccessAt ?? ""))) ||
    !SHA_RE.test(String(compressedSha256 ?? "")) ||
    typeof b2Key !== "string" ||
    b2Key !== `${PREFIX}${compressedSha256}.json.gz` ||
    cursor?.b2_key !== b2Key ||
    cursor?.sha256 !== compressedSha256
  ) {
    throw new Error("PRIVATE_SCORING_D1_READBACK_CONTRACT_INVALID");
  }
  const expectedKeys = [...STAGE_DOMAINS].sort();
  if (
    !counts || !cursor.counts ||
    ![counts, cursor.counts].every((value) =>
      typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join(",") === expectedKeys.join(",") &&
      expectedKeys.every((key) =>
        Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 2))
  ) {
    throw new Error("PRIVATE_SCORING_D1_READBACK_COUNTS_INVALID");
  }
  if (expectedKeys.some((key) => cursor.counts[key] !== counts[key])) {
    throw new Error("PRIVATE_SCORING_D1_READBACK_COUNTS_MISMATCH");
  }
  if(sourceCompanion!==null && (
    typeof sourceCompanion!=="object" ||
    !/^geomacro-evidence\/v1\/private\/gri-original-source-companions\/[a-f0-9]{64}\.json\.gz$/u.test(
      String(sourceCompanion.key ?? "")) ||
    !SHA_RE.test(String(sourceCompanion.compressedSha256 ?? "")) ||
    !SHA_RE.test(String(sourceCompanion.stageSha256 ?? "")) ||
    sourceCompanion.key !==
      "geomacro-evidence/v1/private/gri-original-source-companions/" +
      sourceCompanion.compressedSha256 + ".json.gz" ||
    cursor?.source_companion_key !== sourceCompanion.key ||
    cursor?.source_companion_sha256 !== sourceCompanion.compressedSha256 ||
    cursor?.source_companion_stage_sha256 !== sourceCompanion.stageSha256 ||
    cursor?.source_companion_full_readback_verified !== true ||
    cursor?.source_companion_exact_gzip_restore_verified !== true
  )) throw new Error("PRIVATE_GRI_COMPANION_D1_READBACK_INVALID");
  return true;
}
