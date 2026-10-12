// One immutable multi-source archive object instead of two independent PUT+GET
// pairs when both governed providers fit the existing fragment bounds.
// No Supabase write, raw public exposure, checkpoint promotion or deletion.
import { gunzipSync, gzipSync } from "node:zlib";

export function planSharedGovernedBundle(batches, buildFragment, {
  maxMembers, maxUncompressedBytes, maxCompressedBytes,
} = {}) {
  if (!Array.isArray(batches) || batches.length !== 2 ||
      typeof buildFragment !== "function" ||
      !Number.isSafeInteger(maxMembers) || maxMembers < 2 ||
      !Number.isSafeInteger(maxUncompressedBytes) || maxUncompressedBytes < 1 ||
      !Number.isSafeInteger(maxCompressedBytes) || maxCompressedBytes < 1) {
    throw new Error("GOVERNED_SHARED_BUNDLE_PLAN_INVALID");
  }
  const sourceIds = batches.map(x => x.sourceId);
  if (new Set(sourceIds).size !== 2 ||
      sourceIds.some(x => !/^[a-z][a-z0-9_]{2,60}$/.test(String(x)))) {
    throw new Error("GOVERNED_SHARED_BUNDLE_SOURCE_INVALID");
  }
  const rows = batches.flatMap(batch => {
    if (!Array.isArray(batch.rows) || batch.rows.length < 1) {
      throw new Error("GOVERNED_SHARED_BUNDLE_EMPTY_SOURCE");
    }
    for (const row of batch.rows) {
      if (row?.source_id !== batch.sourceId || !row?.observation_id) {
        throw new Error("GOVERNED_SHARED_BUNDLE_SOURCE_MEMBER_INVALID");
      }
    }
    return batch.rows;
  });
  if (new Set(rows.map(x => x.observation_id)).size !== rows.length) {
    throw new Error("GOVERNED_SHARED_BUNDLE_MEMBER_DUPLICATE");
  }
  // Larger native datasets fall back to the already verified per-source path.
  if (rows.length > maxMembers) return null;
  const fragment = buildFragment("governed_multi_source", rows);
  if (fragment.bundle?.schema !== "geomacro.observation-raw-bundle.v1" ||
      fragment.bundle?.source_id !== "governed_multi_source" ||
      fragment.entries?.length !== rows.length) {
    throw new Error("GOVERNED_SHARED_BUNDLE_SHAPE_INVALID");
  }
  // Same member fingerprint must always denote the same B2 bytes, including
  // on a repeat daily run. Do not write a different wall-clock created_at under
  // the same otherwise content-addressed immutable archive key.
  const latestNativeObservedAt = new Date(Math.max(...rows.map(row =>
    Date.parse(row.observed_at)))).toISOString();
  fragment.bundle.created_at = latestNativeObservedAt;
  fragment.bundleBytes = Buffer.from(JSON.stringify(fragment.bundle));
  fragment.compressed = gzipSync(fragment.bundleBytes, { level: 9 });
  if (fragment.bundleBytes.length > maxUncompressedBytes ||
      fragment.compressed.length > maxCompressedBytes) return null;
  return { ...fragment, sourceIds, totalMembers: rows.length };
}

export function verifySharedGovernedBundle(readback, plan, { sha, hash, maxUncompressedBytes }) {
  if (!plan || typeof sha !== "function" || typeof hash !== "function" ||
      !Number.isSafeInteger(maxUncompressedBytes) || maxUncompressedBytes <= 0) {
    throw new Error("GOVERNED_SHARED_BUNDLE_VERIFY_CONFIG_INVALID");
  }
  const bytes = Buffer.from(readback);
  if (bytes.length !== plan.compressed.length ||
      sha(bytes) !== sha(plan.compressed)) {
    throw new Error("GOVERNED_SHARED_BUNDLE_COMPRESSED_HASH_INVALID");
  }
  let restored;
  try {
    const raw = gunzipSync(bytes, { maxOutputLength: maxUncompressedBytes + 1 });
    if (raw.length !== plan.bundleBytes.length || sha(raw) !== sha(plan.bundleBytes)) {
      throw new Error("GOVERNED_SHARED_BUNDLE_RAW_HASH_INVALID");
    }
    restored = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("GOVERNED_SHARED_BUNDLE_GZIP_RESTORE_INVALID");
  }
  if (restored?.schema !== "geomacro.observation-raw-bundle.v1" ||
      restored?.source_id !== "governed_multi_source" ||
      restored?.storage_mode !== "gzip-fragment-bundle" ||
      restored?.bundle_fingerprint !== plan.fingerprint ||
      !Array.isArray(restored?.entries) ||
      restored.entries.length !== plan.totalMembers ||
      JSON.stringify(restored) !== JSON.stringify(plan.bundle)) {
    throw new Error("GOVERNED_SHARED_BUNDLE_RESTORE_SHAPE_INVALID");
  }
  const expected = new Map(plan.entries.map(x => [x.observation_id, x]));
  for (const item of restored.entries) {
    const original = expected.get(item.observation_id);
    if (!original || !plan.sourceIds.includes(item.normalized_observation?.source_id) ||
        hash(item.normalized_observation) !== item.normalized_sha256 ||
        sha(Buffer.from(JSON.stringify(item.raw_payload))) !== item.payload_sha256 ||
        JSON.stringify(item) !== JSON.stringify(original)) {
      throw new Error("GOVERNED_SHARED_BUNDLE_MEMBER_HASH_INVALID");
    }
  }
  return true;
}
