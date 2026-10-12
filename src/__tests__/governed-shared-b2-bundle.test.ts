import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  planSharedGovernedBundle,
  verifySharedGovernedBundle,
} from "../../scripts/lib/governed-shared-ingestion-bundle.mjs";

const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const hash = (value: unknown) => sha(Buffer.from(JSON.stringify(value)));
const options = {
  maxMembers: 25,
  maxUncompressedBytes: 8_000_000,
  maxCompressedBytes: 1_500_000,
};
function rows() {
  return [
    { sourceId: "eia_api_v2", rows: [{
      observation_id: "eia-a", source_id: "eia_api_v2",
      observed_at: "2026-10-01T00:00:00.000Z",
      raw_hash: "e".repeat(64), _raw_payload: {price: 1},
    }] },
    { sourceId: "noaa_ncei_cdo_api", rows: [{
      observation_id: "noaa-b", source_id: "noaa_ncei_cdo_api",
      observed_at: "2026-10-02T00:00:00.000Z",
      raw_hash: "f".repeat(64), _raw_payload: {temperature: 2},
    }] },
  ];
}
function builder(sourceId: string, input: any[]) {
  const entries = input.map(({_raw_payload, ...normalized}) => ({
    observation_id: normalized.observation_id,
    raw_hash: normalized.raw_hash,
    payload_sha256: sha(Buffer.from(JSON.stringify(_raw_payload))),
    normalized_sha256: hash(normalized),
    normalized_observation: normalized,
    raw_payload: _raw_payload,
  })).sort((a,b)=>a.observation_id.localeCompare(b.observation_id));
  const fingerprint = hash(entries.map(({observation_id,payload_sha256,normalized_sha256}) =>
    ({observation_id,payload_sha256,normalized_sha256})));
  const bundle = {
    schema: "geomacro.observation-raw-bundle.v1",
    storage_mode: "gzip-fragment-bundle",
    compression: "gzip-9",
    source_id: sourceId,
    created_at: new Date().toISOString(),
    bundle_fingerprint: fingerprint,
    entries,
  };
  const bundleBytes = Buffer.from(JSON.stringify(bundle));
  return {
    entries, fingerprint,
    key: `geomacro-evidence/v1/observation-bundles/20261002T000000Z-${fingerprint[0]}-12345678-1234-1234-1234-123456789abc.json.gz`,
    bundle, bundleBytes, compressed: gzipSync(bundleBytes,{level:9}),
  };
}
describe("shared governed B2 transaction bundle",()=>{
  it("combines two providers into ONE immutable archive key and verifies every restored member",()=>{
    const plan=planSharedGovernedBundle(rows(),builder,options);
    expect(plan).not.toBeNull();
    expect(plan?.totalMembers).toBe(2);
    expect(plan?.sourceIds).toEqual(["eia_api_v2","noaa_ncei_cdo_api"]);
    expect(verifySharedGovernedBundle(plan!.compressed,plan,{
      sha,hash,maxUncompressedBytes:options.maxUncompressedBytes,
    })).toBe(true);
    const again=planSharedGovernedBundle(rows(),builder,options)!;
    expect(sha(again.compressed)).toBe(sha(plan!.compressed));
    expect(again.key).toBe(plan!.key);
  });

  it("fails closed for wrong bytes or tampered source member",()=>{
    const plan=planSharedGovernedBundle(rows(),builder,options)!;
    const damaged=Buffer.from(plan.compressed);
    damaged[3]^=0xff;
    expect(()=>verifySharedGovernedBundle(damaged,plan,{
      sha,hash,maxUncompressedBytes:options.maxUncompressedBytes,
    })).toThrow("GOVERNED_SHARED_BUNDLE_COMPRESSED_HASH_INVALID");
    const altered={...plan,entries:[...plan.entries]};
    altered.entries[0]={...altered.entries[0],payload_sha256:"0".repeat(64)};
    expect(()=>verifySharedGovernedBundle(plan.compressed,altered,{
      sha,hash,maxUncompressedBytes:options.maxUncompressedBytes,
    })).toThrow("GOVERNED_SHARED_BUNDLE_MEMBER_HASH_INVALID");
  });

  it("falls back to existing per-source fragments when combined record bounds are exceeded",()=>{
    const oversized=rows();
    oversized[1].rows=Array.from({length:25},(_,i)=>({
      ...oversized[1].rows[0],observation_id:"noaa-"+i,
    }));
    expect(planSharedGovernedBundle(oversized,builder,options)).toBeNull();
  });

  it("refuses duplicates and source-identity mismatches before ANY B2 write",()=>{
    const duplicate=rows();
    duplicate[1].rows[0].observation_id=duplicate[0].rows[0].observation_id;
    expect(()=>planSharedGovernedBundle(duplicate,builder,options))
      .toThrow("GOVERNED_SHARED_BUNDLE_MEMBER_DUPLICATE");
    const wrong=rows();
    wrong[1].rows[0].source_id="eia_api_v2";
    expect(()=>planSharedGovernedBundle(wrong,builder,options))
      .toThrow("GOVERNED_SHARED_BUNDLE_SOURCE_MEMBER_INVALID");
  });

  it("production path still requires shared D1 tickets and independent full B2 readback",()=>{
    const source=readFileSync("scripts/ingest-certified-sources.mjs","utf8");
    expect(source).toContain("const sharedPlan = sourceBatches.length === 2");
    expect(source).toContain("archiveSharedGovernedBatches(sourceBatches, sharedPlan)");
    expect(source).toContain("b2.putWithMetadataVerification(");
    expect(source).toContain("verifySharedGovernedBundle(readback, planned");
    expect(source).toContain("const quotaSnapshot=await createB2D1AccountGovernor().status();");
    expect(source).toContain("GOVERNED_SOURCE_SHARED_B2_PLAN_QUOTA_HELD");
    expect(source).toContain("source_member_set_sha256");
    expect(source).toContain("supabase_mirror_attempted: false");
    expect(source).toContain("payment_performed: false");
    expect(source).toContain("destructive_change: false");
  });
});
