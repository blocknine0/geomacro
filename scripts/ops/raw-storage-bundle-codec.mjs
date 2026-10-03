import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

export const RAW_STORAGE_BUNDLE_V1 = "geomacro.raw-storage-bundle.v1";
export const RAW_STORAGE_BUNDLE_V2 = "geomacro.raw-storage-bundle.v2";
const MAX_RESTORE_BYTES = 80_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function normalizedMember(member) {
  const snapshotId = String(member?.snapshot_id ?? "");
  const objectPath = String(member?.object_path ?? "");
  const fetchedAt = String(member?.fetched_at ?? "");
  const payloadBytes = Number(member?.payload_bytes ?? -1);
  const payloadSha256 = String(member?.payload_sha256 ?? "");
  const memberCompressedSha256 = String(member?.member_compressed_sha256 ?? "");
  const payload = Buffer.from(member?.payload ?? []);
  const sourceCompressed = Buffer.from(member?.source_compressed ?? []);

  if (!snapshotId || !objectPath || !Number.isInteger(payloadBytes) || payloadBytes < 0 ||
      !/^[a-f0-9]{64}$/.test(payloadSha256) || !/^[a-f0-9]{64}$/.test(memberCompressedSha256) ||
      payload.length !== payloadBytes || sha(payload) !== payloadSha256 ||
      sha(sourceCompressed) !== memberCompressedSha256) {
    throw new Error(`RAW_STORAGE_BUNDLE_MEMBER_INVALID_${snapshotId || "unknown"}`);
  }

  return {
    snapshot_id: snapshotId,
    object_path: objectPath,
    fetched_at: fetchedAt,
    payload_bytes: payloadBytes,
    payload_sha256: payloadSha256,
    member_compressed_sha256: memberCompressedSha256,
    payload,
    source_compressed: sourceCompressed,
  };
}

function envelopeBase({ schema, bundleId, shardSuffix, createdAt }) {
  return {
    schema,
    bundle_id: bundleId,
    shard_suffix: shardSuffix,
    created_at: createdAt,
  };
}

function v1Envelope(args, members) {
  return {
    ...envelopeBase({ ...args, schema: RAW_STORAGE_BUNDLE_V1 }),
    entries: members.map((member) => ({
      snapshot_id: member.snapshot_id,
      object_path: member.object_path,
      fetched_at: member.fetched_at,
      payload_bytes: member.payload_bytes,
      payload_sha256: member.payload_sha256,
      member_compressed_sha256: member.member_compressed_sha256,
      compressed_b64: member.source_compressed.toString("base64"),
    })),
  };
}

function v2Envelope(args, members) {
  return {
    ...envelopeBase({ ...args, schema: RAW_STORAGE_BUNDLE_V2 }),
    storage_encoding: "single-gzip-raw-members",
    compression: "gzip-9",
    entries: members.map((member) => ({
      snapshot_id: member.snapshot_id,
      object_path: member.object_path,
      fetched_at: member.fetched_at,
      payload_bytes: member.payload_bytes,
      payload_sha256: member.payload_sha256,
      // Keep the original source gzip hash as the DB pointer/member identity,
      // even though v2 stores the verified raw bytes only once inside the outer gzip.
      member_compressed_sha256: member.member_compressed_sha256,
      source_compressed_sha256: member.member_compressed_sha256,
      payload_b64: member.payload.toString("base64"),
    })),
  };
}

export function packAdaptiveRawStorageBundle({ bundleId, shardSuffix, createdAt, members }) {
  if (!bundleId || typeof shardSuffix !== "string" || !createdAt || !Array.isArray(members) || !members.length) {
    throw new Error("RAW_STORAGE_BUNDLE_PACK_CONFIG_INVALID");
  }
  const normalized = members.map(normalizedMember);
  const v1 = v1Envelope({ bundleId, shardSuffix, createdAt }, normalized);
  const v2 = v2Envelope({ bundleId, shardSuffix, createdAt }, normalized);
  const v1Packed = gzipSync(Buffer.from(JSON.stringify(v1)), { level: 9 });
  const v2Packed = gzipSync(Buffer.from(JSON.stringify(v2)), { level: 9 });
  const useV2 = v2Packed.length < v1Packed.length;
  const bundle = useV2 ? v2 : v1;
  const packed = useV2 ? v2Packed : v1Packed;
  return {
    bundle,
    packed,
    schema: bundle.schema,
    storage_encoding: useV2 ? "single-gzip-raw-members" : "nested-source-gzip",
    baseline_v1_bytes: v1Packed.length,
    candidate_v2_bytes: v2Packed.length,
    selected_bytes: packed.length,
    bytes_saved_vs_v1: Math.max(0, v1Packed.length - packed.length),
    saving_ratio_vs_v1: Number((Math.max(0, v1Packed.length - packed.length) / Math.max(1, v1Packed.length)).toFixed(6)),
  };
}

export function verifyRawStorageBundle({ bytes, expectedSha256, expectedBundleId, expectedShardSuffix, expectedMembers }) {
  const packed = Buffer.from(bytes);
  if (!/^[a-f0-9]{64}$/.test(String(expectedSha256 ?? "")) || sha(packed) !== expectedSha256) {
    throw new Error("RAW_STORAGE_BUNDLE_HASH_INVALID");
  }
  let restored;
  try {
    restored = JSON.parse(gunzipSync(packed, { maxOutputLength: MAX_RESTORE_BYTES }).toString("utf8"));
  } catch {
    throw new Error("RAW_STORAGE_BUNDLE_RESTORE_INVALID");
  }
  if (![RAW_STORAGE_BUNDLE_V1, RAW_STORAGE_BUNDLE_V2].includes(restored?.schema) ||
      restored?.bundle_id !== expectedBundleId || restored?.shard_suffix !== expectedShardSuffix ||
      !Array.isArray(restored?.entries) || restored.entries.length !== expectedMembers.length) {
    throw new Error("RAW_STORAGE_BUNDLE_SHAPE_INVALID");
  }
  if (restored.schema === RAW_STORAGE_BUNDLE_V2 &&
      (restored.storage_encoding !== "single-gzip-raw-members" || restored.compression !== "gzip-9")) {
    throw new Error("RAW_STORAGE_BUNDLE_V2_ENCODING_INVALID");
  }

  const expected = new Map(expectedMembers.map((member) => [String(member.snapshot_id), member]));
  const payloadById = new Map();
  const seen = new Set();
  for (const entry of restored.entries) {
    const id = String(entry?.snapshot_id ?? "");
    const wanted = expected.get(id);
    if (!wanted || seen.has(id) || entry.object_path !== wanted.object_path ||
        Number(entry.payload_bytes) !== Number(wanted.payload_bytes) ||
        entry.payload_sha256 !== wanted.payload_sha256 ||
        entry.member_compressed_sha256 !== wanted.member_compressed_sha256) {
      throw new Error(`RAW_STORAGE_BUNDLE_MEMBER_METADATA_INVALID_${id || "unknown"}`);
    }
    seen.add(id);

    let payload;
    if (restored.schema === RAW_STORAGE_BUNDLE_V1) {
      if (typeof entry.compressed_b64 !== "string") throw new Error(`RAW_STORAGE_BUNDLE_V1_MEMBER_INVALID_${id}`);
      const memberCompressed = Buffer.from(entry.compressed_b64, "base64");
      if (sha(memberCompressed) !== wanted.member_compressed_sha256) {
        throw new Error(`RAW_STORAGE_BUNDLE_MEMBER_COMPRESSED_HASH_INVALID_${id}`);
      }
      try {
        payload = gunzipSync(memberCompressed, { maxOutputLength: Number(wanted.payload_bytes) + 1 });
      } catch {
        throw new Error(`RAW_STORAGE_BUNDLE_MEMBER_GUNZIP_INVALID_${id}`);
      }
    } else {
      if (entry.source_compressed_sha256 !== wanted.member_compressed_sha256 || typeof entry.payload_b64 !== "string") {
        throw new Error(`RAW_STORAGE_BUNDLE_V2_MEMBER_INVALID_${id}`);
      }
      payload = Buffer.from(entry.payload_b64, "base64");
    }
    if (payload.length !== Number(wanted.payload_bytes) || sha(payload) !== wanted.payload_sha256) {
      throw new Error(`RAW_STORAGE_BUNDLE_MEMBER_PAYLOAD_INVALID_${id}`);
    }
    payloadById.set(id, payload);
  }
  if (seen.size !== expectedMembers.length) throw new Error("RAW_STORAGE_BUNDLE_MEMBER_SET_INVALID");
  return { schema: restored.schema, storage_encoding: restored.storage_encoding ?? "nested-source-gzip", payloadById, restored };
}
