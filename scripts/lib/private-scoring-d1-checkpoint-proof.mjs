import { STAGE_DOMAINS, CANONICAL_CLASSIFIER_VERSION } from "./restricted-private-scored-stage.mjs";
import { PRIVATE_COMBINED_ARCHIVE_SCHEMA, PRIVATE_COMBINED_ARCHIVE_PREFIX } from "./private-stage-companion-b2-bundle.mjs";

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
    b2Key !== (cursor?.archive_format===PRIVATE_COMBINED_ARCHIVE_SCHEMA
      ? `${PRIVATE_COMBINED_ARCHIVE_PREFIX}${compressedSha256}.json.gz`
      : `${PREFIX}${compressedSha256}.json.gz`) ||
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
  if(sourceCompanion!==null) {
    const common=typeof sourceCompanion==="object" &&
      SHA_RE.test(String(sourceCompanion.compressedSha256??"")) &&
      SHA_RE.test(String(sourceCompanion.stageSha256??"")) &&
      cursor?.source_companion_key===sourceCompanion.key &&
      cursor?.source_companion_sha256===sourceCompanion.compressedSha256 &&
      cursor?.source_companion_stage_sha256===sourceCompanion.stageSha256 &&
      cursor?.source_companion_full_readback_verified===true &&
      cursor?.source_companion_exact_gzip_restore_verified===true;
    if(!common)throw Error("PRIVATE_GRI_COMPANION_D1_READBACK_INVALID");
    if(cursor.archive_format===PRIVATE_COMBINED_ARCHIVE_SCHEMA) {
      // One B2 object contains two independently hash-checked logical members.
      // An old two-object checkpoint is still accepted through the legacy path.
      if(sourceCompanion.key!==b2Key ||
         sourceCompanion.compressedSha256!==compressedSha256 ||
         !SHA_RE.test(String(sourceCompanion.logicalSha256??"")) ||
         !SHA_RE.test(String(sourceCompanion.stageLogicalSha256??"")) ||
         cursor.stage_logical_sha256!==sourceCompanion.stageLogicalSha256 ||
         cursor.source_companion_logical_sha256!==sourceCompanion.logicalSha256 ||
         cursor.source_companion_stage_sha256!==sourceCompanion.stageLogicalSha256)
        throw Error("PRIVATE_GRI_COMPANION_BUNDLED_D1_READBACK_INVALID");
    } else {
       if(sourceCompanion.key!==null && typeof sourceCompanion.key!=="string") throw Error("PRIVATE_GRI_COMPANION_D1_READBACK_INVALID");
         sourceCompanion.key!=="geomacro-evidence/v1/private/gri-original-source-companions/"+
           sourceCompanion.compressedSha256+".json.gz")
        throw Error("PRIVATE_GRI_COMPANION_D1_READBACK_INVALID");
    }
  }
  return true;
}
