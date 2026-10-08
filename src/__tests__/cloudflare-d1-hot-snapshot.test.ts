import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import controlPlane from "../../workers/control-plane/src/index.mjs";

const TOKEN = "t".repeat(64);
const GLOBAL_RISK_KEY = "geomacro-evidence/v1/live/global-risk/latest.json.gz";

function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bound = values;
          return {
            async run() {
              if (sql.includes("INSERT INTO public_b2_hot_snapshot")) {
                const [product, schema, generatedAt, sourceAsOf, expiresAt, b2Key, b2Sha, payloadSha, proofSchema, verifiedAt, sourceRunId, payloadJson] = bound;
                rows.set(String(product), {
                  product,
                  schema_name: schema,
                  generated_at: generatedAt,
                  source_as_of: sourceAsOf,
                  expires_at: expiresAt,
                  b2_object_key: b2Key,
                  b2_sha256: b2Sha,
                  payload_sha256: payloadSha,
                  proof_schema: proofSchema,
                  verified_at: verifiedAt,
                  source_run_id: sourceRunId,
                  payload_json: payloadJson,
                });
              }
              return { success: true };
            },
            async first() {
              return rows.get(String(bound[0])) ?? null;
            },
          };
        },
      };
    },
  };
}

function request(path: string, method: "GET" | "PUT", body?: unknown) {
  const authenticated = method === "PUT" || path.startsWith("/v1/hot-snapshot-anchor/");
  return new Request(`https://control.test${path}`, {
    method,
    headers: authenticated ? {
      Authorization: `Bearer ${TOKEN}`,
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    } : {},
    body: body == null ? undefined : JSON.stringify(body),
  });
}

describe("D1 B2-verified hot snapshots", () => {
  it("publishes only a hash-bound snapshot with full B2 readback proof and serves its exact bytes", async () => {
    const db = fakeDb();
    const env = { DB: db, CONTROL_PLANE_TOKEN: TOKEN };
    const generatedAt = new Date().toISOString();
    const sourceAsOf = new Date(Date.now() - 60_000).toISOString();
    const value = {
      schema: "geomacro.public-global-risk-live.v1",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: { snapshotId: "snapshot-1", snapshotAsOf: sourceAsOf },
    };
    const payloadJson = JSON.stringify(value);
    const proof = {
      schema: "geomacro.public-global-risk-live-proof.v1",
      live_key: GLOBAL_RISK_KEY,
      generated_at: generatedAt,
      snapshot_id: "snapshot-1",
      snapshot_as_of: sourceAsOf,
      compressed_sha256: "a".repeat(64),
      full_b2_readback_verified: true,
      exact_gzip_restore_verified: true,
    };
    const put = await controlPlane.fetch(request("/v1/hot-snapshot/global-risk", "PUT", {
      value,
      proof,
      payload_sha256: createHash("sha256").update(payloadJson).digest("hex"),
      source_run_id: "17201234567",
    }), env);
    expect(put.status).toBe(200);
    expect(db.rows.has("global-risk")).toBe(true);

    const get = await controlPlane.fetch(request("/v1/public/hot-snapshot/global-risk", "GET"), env);
    const result = await get.json() as Record<string, unknown>;
    expect(get.status).toBe(200);
    expect(result.b2_object_key).toBe(GLOBAL_RISK_KEY);
    expect(result.b2_sha256).toBe("a".repeat(64));
    expect(result.full_b2_readback_verified).toBe(true);
    expect(result.exact_gzip_restore_verified).toBe(true);
    expect(result.payload_json).toBe(payloadJson);
    const row = db.rows.get("global-risk");
    expect(row).toBeDefined();
    row!.payload_json = `${payloadJson} `;
    const tampered = await controlPlane.fetch(request("/v1/public/hot-snapshot/global-risk", "GET"), env);
    expect(tampered.status).toBe(503);
  });

  it("carries a direct B2 anchor into a fresh independently verified Global Risk recovery snapshot", async () => {
    const db = fakeDb();
    const env = { DB: db, CONTROL_PLANE_TOKEN: TOKEN };
    const baselineGeneratedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const baselineAsOf = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const baselineValue = {
      schema: "geomacro.public-global-risk-live.v1",
      generated_at: baselineGeneratedAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: { snapshotId: "baseline-1", snapshotAsOf: baselineAsOf },
    };
    const baselineJson = JSON.stringify(baselineValue);
    const baselineProof = {
      schema: "geomacro.public-global-risk-live-proof.v1",
      live_key: GLOBAL_RISK_KEY,
      generated_at: baselineGeneratedAt,
      snapshot_id: "baseline-1",
      snapshot_as_of: baselineAsOf,
      compressed_sha256: "a".repeat(64),
      full_b2_readback_verified: true,
      exact_gzip_restore_verified: true,
    };
    const directPut = await controlPlane.fetch(request("/v1/hot-snapshot/global-risk", "PUT", {
      value: baselineValue,
      proof: baselineProof,
      payload_sha256: createHash("sha256").update(baselineJson).digest("hex"),
      source_run_id: "17201234567",
    }), env);
    expect(directPut.status).toBe(200);

    const anchorResponse = await controlPlane.fetch(
      request("/v1/hot-snapshot-anchor/global-risk", "GET"),
      env,
    );
    const anchor = await anchorResponse.json() as Record<string, unknown>;
    expect(anchorResponse.status).toBe(200);
    expect(anchor.b2_sha256).toBe("a".repeat(64));
    expect(anchor.payload_sha256).toBe(createHash("sha256").update(baselineJson).digest("hex"));

    const now = new Date().toISOString();
    const hex = (char: string) => char.repeat(64);
    const domains = Object.fromEntries(["geopolitics", "macro", "rare_earth"].map((key) => [key, {
      series: {
        "7D": { buckets: [{}, {}] },
        "30D": { buckets: [{}, {}, {}] },
      },
    }]));
    const data = {
      snapshotId: "current-1",
      snapshotAsOf: now,
      verificationStatus: "verified",
      methodologyVersion: "gri-v1.2.0",
      auditPersisted: true,
      proofHash: hex("1"),
      evidenceHash: hex("2"),
      calculationHash: hex("3"),
      dispositionHash: hex("4"),
      inputHash: hex("5"),
      methodologyHash: hex("6"),
      changeHash: hex("7"),
      candidateEventCount: 9,
      reconciliationResidual: 0,
      changeResidual: 0,
      domainIndices: domains,
    };
    const currentProof = {
      proofHash: data.proofHash,
      evidenceHash: data.evidenceHash,
      calculationHash: data.calculationHash,
      dispositionHash: data.dispositionHash,
      inputHash: data.inputHash,
      methodologyHash: data.methodologyHash,
      changeHash: data.changeHash,
      candidateEventCount: data.candidateEventCount,
      reconciliationResidual: data.reconciliationResidual,
      changeResidual: data.changeResidual,
    };
    const recoveryValue = {
      schema: "geomacro.public-global-risk-live.v1",
      generated_at: now,
      source_project: "ldpwajisioljyjtojvfx",
      verification_mode: "independent-gri-proof-over-b2-baseline",
      baseline_b2_sha256: anchor.b2_sha256,
      baseline_payload_sha256: anchor.payload_sha256,
      baseline_source_run_id: anchor.source_run_id,
      baseline_generated_at: anchor.generated_at,
      current_b2_snapshot_promoted: false,
      current_proof: currentProof,
      data,
    };
    const recoveryProof = {
      schema: "geomacro.public-global-risk-current-proof.v1",
      verification_mode: "independent-gri-proof-over-b2-baseline",
      generated_at: now,
      live_key: GLOBAL_RISK_KEY,
      snapshot_id: data.snapshotId,
      snapshot_as_of: data.snapshotAsOf,
      proof_hash: data.proofHash,
      evidence_hash: data.evidenceHash,
      calculation_hash: data.calculationHash,
      disposition_hash: data.dispositionHash,
      input_hash: data.inputHash,
      methodology_hash: data.methodologyHash,
      change_hash: data.changeHash,
      candidate_event_count: data.candidateEventCount,
      reconciliation_residual: data.reconciliationResidual,
      change_residual: data.changeResidual,
      independent_gri_proof_verified: true,
      baseline_b2_sha256: anchor.b2_sha256,
      baseline_payload_sha256: anchor.payload_sha256,
      baseline_source_run_id: anchor.source_run_id,
      baseline_generated_at: anchor.generated_at,
      baseline_b2_readback_verified: true,
      baseline_exact_gzip_restore_verified: true,
      current_b2_readback_verified: false,
      current_b2_snapshot_promoted: false,
    };
    const recoveryJson = JSON.stringify(recoveryValue);
    const recoveryPut = await controlPlane.fetch(request("/v1/hot-snapshot/global-risk", "PUT", {
      value: recoveryValue,
      proof: recoveryProof,
      payload_sha256: createHash("sha256").update(recoveryJson).digest("hex"),
      source_run_id: "17201234999",
    }), env);
    const recoveryResult = await recoveryPut.json() as Record<string, unknown>;
    expect(recoveryPut.status).toBe(200);
    expect(recoveryResult.verification_mode).toBe("independent-gri-proof-over-b2-baseline");
    expect(recoveryResult.current_b2_readback_verified).toBe(false);
    expect(recoveryResult.current_b2_snapshot_promoted).toBe(false);
    expect(recoveryResult.baseline_b2_readback_verified).toBe(true);

    const publicGet = await controlPlane.fetch(request("/v1/public/hot-snapshot/global-risk", "GET"), env);
    const publicResult = await publicGet.json() as Record<string, unknown>;
    expect(publicGet.status).toBe(200);
    expect(publicResult.verification_mode).toBe("independent-gri-proof-over-b2-baseline");
    expect(publicResult.b2_sha256).toBe("a".repeat(64));
    expect(publicResult.payload_json).toBe(recoveryJson);

    const forged = {
      ...recoveryProof,
      baseline_b2_sha256: "b".repeat(64),
    };
    const forgedPut = await controlPlane.fetch(request("/v1/hot-snapshot/global-risk", "PUT", {
      value: { ...recoveryValue, baseline_b2_sha256: "b".repeat(64) },
      proof: forged,
      payload_sha256: createHash("sha256").update(JSON.stringify({ ...recoveryValue, baseline_b2_sha256: "b".repeat(64) })).digest("hex"),
      source_run_id: "17201235000",
    }), env);
    expect(forgedPut.status).toBe(400);
  });

  it("rejects unverified or stale evidence and returns 503 when there is no last-good snapshot", async () => {
    const env = { DB: fakeDb(), CONTROL_PLANE_TOKEN: TOKEN };
    const generatedAt = new Date().toISOString();
    const staleAsOf = new Date(Date.now() - 91 * 60_000).toISOString();
    const value = {
      schema: "geomacro.public-global-risk-live.v1",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: { snapshotId: "snapshot-stale", snapshotAsOf: staleAsOf },
    };
    const proof = {
      schema: "geomacro.public-global-risk-live-proof.v1",
      live_key: GLOBAL_RISK_KEY,
      generated_at: generatedAt,
      snapshot_id: "snapshot-stale",
      snapshot_as_of: staleAsOf,
      compressed_sha256: "b".repeat(64),
      full_b2_readback_verified: false,
      exact_gzip_restore_verified: true,
    };
    const put = await controlPlane.fetch(request("/v1/hot-snapshot/global-risk", "PUT", {
      value,
      proof,
      payload_sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
      source_run_id: "17201234567",
    }), env);
    expect(put.status).toBe(400);
    const get = await controlPlane.fetch(request("/v1/public/hot-snapshot/global-risk", "GET"), env);
    expect(get.status).toBe(503);
  });
});
