import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  RAW_STORAGE_BUNDLE_V1,
  RAW_STORAGE_BUNDLE_V2,
  packAdaptiveRawStorageBundle,
  verifyRawStorageBundle,
} from "../../scripts/ops/raw-storage-bundle-codec.mjs";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function member(index: number, payload: Buffer) {
  const sourceCompressed = gzipSync(payload, { level: 9 });
  return {
    snapshot_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    object_path: `raw/v1/test/${index}.json.gz`,
    fetched_at: "2026-10-03T00:00:00.000Z",
    payload_bytes: payload.length,
    payload_sha256: sha(payload),
    member_compressed_sha256: sha(sourceCompressed),
    payload,
    source_compressed: sourceCompressed,
  };
}

function deterministicNoise(size: number) {
  const chunks: Buffer[] = [];
  for (let counter = 0; Buffer.concat(chunks).length < size; counter += 1) {
    chunks.push(createHash("sha256").update(`geomacro-noise-${counter}`).digest());
  }
  return Buffer.concat(chunks).subarray(0, size);
}

describe("adaptive raw storage bundle codec", () => {
  it("uses single-compression v2 when shared raw structure saves space", () => {
    const members = Array.from({ length: 12 }, (_, index) => member(index, Buffer.from(JSON.stringify({
      source: "shared-provider",
      country: "USA",
      metric: "electricity_retail_price",
      repeated_context: "supply-chain-risk-context-".repeat(80),
      index,
    }))));
    const packed = packAdaptiveRawStorageBundle({
      bundleId: "20261003T000000Z-a-00000000-0000-4000-8000-000000000001",
      shardSuffix: "a",
      createdAt: "2026-10-03T00:00:00.000Z",
      members,
    });
    expect(packed.schema).toBe(RAW_STORAGE_BUNDLE_V2);
    expect(packed.selected_bytes).toBeLessThan(packed.baseline_v1_bytes);
    expect(packed.bytes_saved_vs_v1).toBeGreaterThan(0);

    const verified = verifyRawStorageBundle({
      bytes: packed.packed,
      expectedSha256: sha(packed.packed),
      expectedBundleId: "20261003T000000Z-a-00000000-0000-4000-8000-000000000001",
      expectedShardSuffix: "a",
      expectedMembers: members,
    });
    expect(verified.schema).toBe(RAW_STORAGE_BUNDLE_V2);
    for (const item of members) expect(verified.payloadById.get(item.snapshot_id)?.equals(item.payload)).toBe(true);
  });

  it("never selects a representation larger than the legacy v1 baseline", () => {
    const members = Array.from({ length: 6 }, (_, index) => member(index + 20, deterministicNoise(8192 + index * 17)));
    const packed = packAdaptiveRawStorageBundle({
      bundleId: "20261003T000000Z-b-00000000-0000-4000-8000-000000000002",
      shardSuffix: "b",
      createdAt: "2026-10-03T00:00:00.000Z",
      members,
    });
    expect([RAW_STORAGE_BUNDLE_V1, RAW_STORAGE_BUNDLE_V2]).toContain(packed.schema);
    expect(packed.selected_bytes).toBeLessThanOrEqual(packed.baseline_v1_bytes);
    expect(packed.bytes_saved_vs_v1).toBeGreaterThanOrEqual(0);
  });

  it("fails closed on a tampered B2 bundle", () => {
    const members = [member(99, Buffer.from("verified-payload-".repeat(200)))];
    const packed = packAdaptiveRawStorageBundle({
      bundleId: "20261003T000000Z-c-00000000-0000-4000-8000-000000000003",
      shardSuffix: "c",
      createdAt: "2026-10-03T00:00:00.000Z",
      members,
    });
    const tampered = Buffer.from(packed.packed);
    tampered[Math.floor(tampered.length / 2)] ^= 1;
    expect(() => verifyRawStorageBundle({
      bytes: tampered,
      expectedSha256: sha(packed.packed),
      expectedBundleId: "20261003T000000Z-c-00000000-0000-4000-8000-000000000003",
      expectedShardSuffix: "c",
      expectedMembers: members,
    })).toThrow("RAW_STORAGE_BUNDLE_HASH_INVALID");
  });
});
