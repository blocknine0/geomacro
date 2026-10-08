import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

function fixture(b2Sha = "a".repeat(64)) {
  const root = mkdtempSync(join(tmpdir(), "geomacro-risk-indices-continuity-"));
  roots.push(root);
  const artifacts = join(root, "artifacts");
  mkdirSync(artifacts);
  const snapshotId = "123e4567-e89b-42d3-a456-426614174000";
  const snapshotAsOf = "2026-10-08T05:41:51.524Z";
  const generatedAt = "2026-10-08T05:43:20.000Z";
  const payload = {
    schema: "geomacro.public-risk-indices-live.v1",
    generated_at: generatedAt,
    source_project: "ldpwajisioljyjtojvfx",
    data: {
      contractVersion: "risk-indices-v1.1.0",
      parentMethodologyVersion: "gri-v1.2.0",
      verificationStatus: "verified",
      snapshotId,
      snapshotAsOf,
      indices: [],
    },
  };
  const payloadJson = JSON.stringify(payload);
  const proof = {
    ok: true,
    schema: "geomacro.public-risk-indices-direct-postgres-publish.v1",
    b2_readback_verified: true,
    destructive_change: false,
    live_sha256: "a".repeat(64),
    snapshot_id: snapshotId,
    snapshot_as_of: snapshotAsOf,
  };
  const staleEdge = {
    ...payload,
    data: {
      ...payload.data,
      snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshotAsOf: "2026-10-08T04:41:51.524Z",
    },
  };
  const hot = {
    ok: true,
    product: "risk-indices",
    schema: payload.schema,
    generated_at: generatedAt,
    source_as_of: snapshotAsOf,
    expires_at: "2026-10-08T07:11:51.524Z",
    b2_object_key: "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    b2_sha256: b2Sha,
    payload_sha256: createHash("sha256").update(payloadJson).digest("hex"),
    proof_schema: "geomacro.public-risk-indices-live-proof.v1",
    verified_at: "2026-10-08T05:43:21.000Z",
    full_b2_readback_verified: true,
    exact_gzip_restore_verified: true,
    payload_json: payloadJson,
  };
  const proofPath = join(root, "proof.json");
  const outputPath = join(root, "continuity.mjs");
  writeFileSync(proofPath, JSON.stringify(proof));
  writeFileSync(join(artifacts, "risk-indices-edge.json"), JSON.stringify(staleEdge));
  writeFileSync(join(artifacts, "risk-indices-hot-snapshot.json"), JSON.stringify(hot));
  return { root, artifacts, proofPath, outputPath, snapshotId };
}

function materialize(args: ReturnType<typeof fixture>) {
  execFileSync(process.execPath, [
    "scripts/ops/materialize-edge-continuity.mjs",
    "--product", "risk-indices",
    "--artifact-dir", args.artifacts,
    "--proof", args.proofPath,
    "--source-run-id", "37716849253",
    "--output", args.outputPath,
  ], { cwd: process.cwd(), stdio: "pipe" });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Risk Indices edge continuity from verified D1 hot snapshot", () => {
  it("uses the B2-proof-bound D1 hot payload when the edge artifact is stale", () => {
    const args = fixture();
    materialize(args);
    const output = readFileSync(args.outputPath, "utf8");
    const continuity = JSON.parse(
      output.replace(/^export default\s+/u, "").replace(/;\s*$/u, ""),
    );
    const payload = JSON.parse(continuity.payload_json);
    expect(continuity.schema).toBe("geomacro.edge-continuity.v1");
    expect(continuity.product).toBe("risk-indices");
    expect(continuity.source_run_id).toBe("37716849253");
    expect(continuity.b2_readback_verified).toBe(true);
    expect(payload.data.snapshotId).toBe(args.snapshotId);
  });

  it("rejects a D1 hot payload whose B2 SHA does not match the selected publisher proof", () => {
    const args = fixture("b".repeat(64));
    expect(() => materialize(args)).toThrow();
    expect(() => readFileSync(args.outputPath, "utf8")).toThrow();
  });
});
