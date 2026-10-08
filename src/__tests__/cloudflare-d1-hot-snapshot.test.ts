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
              if (sql.includes("WHERE product = 'global-risk'")) {
                return rows.get("global-risk") ?? null;
              }
              return rows.get(String(bound[0])) ?? null;
            },
          };
        },
      };
    },
  };
}

function request(path: string, method: "GET" | "PUT", body?: unknown) {
  return new Request(`https://control.test${path}`, {
    method,
    headers: method === "PUT" ? {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
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

  it("accepts a Risk Indices projection only when it is exactly bound to the current verified Global Risk D1 parent", async () => {
    const db = fakeDb();
    const env = { DB: db, CONTROL_PLANE_TOKEN: TOKEN };
    const parentGeneratedAt = new Date(Date.now() - 30_000).toISOString();
    const sourceAsOf = new Date(Date.now() - 60_000).toISOString();
    const parentB2Sha = "c".repeat(64);
    const series = {
      "24H": { timeframe: "24H", buckets: [{ t: 1, avg: 50, count: 2 }, { t: 2, avg: 51, count: 2 }], low: 50, high: 51 },
      "7D": { timeframe: "7D", buckets: [{ t: 1, avg: 50, count: 2 }, { t: 2, avg: 51, count: 2 }], low: 50, high: 51 },
      "30D": { timeframe: "30D", buckets: [{ t: 1, avg: 50, count: 2 }, { t: 2, avg: 51, count: 2 }], low: 50, high: 51 },
    };
    const domains = Object.fromEntries([
      ["geopolitics", 61],
      ["macro", 52],
      ["rare_earth", 47],
    ].map(([key, score]) => [key, {
      readingStatus: "current",
      readingSnapshotId: "snapshot-parent",
      readingAsOf: sourceAsOf,
      score,
      rawScore: score,
      previousScore: null,
      changePoints: null,
      confidence: 75,
      eventCount: 4,
      sourceCount: 4,
      independentStoryCount: 3,
      series,
    }]));
    const drivers = ["geopolitics", "macro", "rare_earth"].map((category) => ({
      category,
      topEvent: { id: `event-${category}`, title: `Driver ${category}` },
    }));
    const risk = {
      snapshotId: "snapshot-parent",
      snapshotAsOf: sourceAsOf,
      methodologyVersion: "gri-v1.2.0",
      verificationStatus: "verified",
      auditPersisted: true,
      proofHash: "1".repeat(64),
      evidenceHash: "2".repeat(64),
      calculationHash: "3".repeat(64),
      dispositionHash: "4".repeat(64),
      inputHash: "5".repeat(64),
      methodologyHash: "6".repeat(64),
      changeHash: "7".repeat(64),
      candidateEventCount: 12,
      reconciliationResidual: 0,
      changeResidual: 0,
      domainIndices: domains,
      drivers,
    };
    const parentValue = {
      schema: "geomacro.public-global-risk-live.v1",
      generated_at: parentGeneratedAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: risk,
    };
    const parentPayloadJson = JSON.stringify(parentValue);
    const parentPayloadSha = createHash("sha256").update(parentPayloadJson).digest("hex");
    const parentProof = {
      schema: "geomacro.public-global-risk-live-proof.v1",
      live_key: GLOBAL_RISK_KEY,
      generated_at: parentGeneratedAt,
      snapshot_id: risk.snapshotId,
      snapshot_as_of: sourceAsOf,
      compressed_sha256: parentB2Sha,
      full_b2_readback_verified: true,
      exact_gzip_restore_verified: true,
    };
    const parentPut = await controlPlane.fetch(request("/v1/hot-snapshot/global-risk", "PUT", {
      value: parentValue,
      proof: parentProof,
      payload_sha256: parentPayloadSha,
      source_run_id: "17201234567",
    }), env);
    expect(parentPut.status).toBe(200);

    const specs = [
      ["geopolitics", "geopolitics"],
      ["macro", "macro"],
      ["critical_minerals", "rare_earth"],
    ] as const;
    const indices = specs.map(([key, domainKey]) => {
      const domain = domains[domainKey] as any;
      return {
        key,
        name: key,
        sourceCategory: domainKey,
        status: "available",
        readingStatus: domain.readingStatus,
        readingSnapshotId: domain.readingSnapshotId,
        readingAsOf: domain.readingAsOf,
        readingAgeHours: 0,
        score: domain.score,
        rawScore: domain.rawScore,
        previousScore: domain.previousScore,
        changePoints: domain.changePoints,
        confidence: domain.confidence,
        eventCount: domain.eventCount,
        sourceCount: domain.sourceCount,
        independentStoryCount: domain.independentStoryCount,
        series: domain.series,
        topEvent: drivers.find((driver) => driver.category === domainKey)?.topEvent ?? null,
      };
    });
    const projectedData = {
      contractVersion: "risk-indices-v1.1.0",
      parentMethodologyVersion: risk.methodologyVersion,
      proofVersion: "",
      proofScope: "verified-category-projection",
      snapshotId: risk.snapshotId,
      snapshotAsOf: risk.snapshotAsOf,
      verificationStatus: "verified",
      proofHash: risk.proofHash,
      evidenceHash: risk.evidenceHash,
      calculationHash: risk.calculationHash,
      dispositionHash: risk.dispositionHash,
      inputHash: risk.inputHash,
      methodologyHash: risk.methodologyHash,
      changeHash: risk.changeHash,
      candidateEventCount: risk.candidateEventCount,
      reconciliationResidual: risk.reconciliationResidual,
      changeResidual: risk.changeResidual,
      indices,
    };
    const generatedAt = new Date().toISOString();
    const value = {
      schema: "geomacro.public-risk-indices-live.v1",
      generated_at: generatedAt,
      source_project: "ldpwajisioljyjtojvfx",
      verification_mode: "global-risk-parent-projection",
      parent_product: "global-risk",
      parent_b2_sha256: parentB2Sha,
      parent_payload_sha256: parentPayloadSha,
      data: projectedData,
    };
    const payloadJson = JSON.stringify(value);
    const proof = {
      schema: "geomacro.public-risk-indices-parent-projection-proof.v1",
      generated_at: generatedAt,
      parent_product: "global-risk",
      live_key: GLOBAL_RISK_KEY,
      parent_source_as_of: sourceAsOf,
      parent_payload_sha256: parentPayloadSha,
      snapshot_id: risk.snapshotId,
      snapshot_as_of: sourceAsOf,
      compressed_sha256: parentB2Sha,
      full_b2_readback_verified: true,
      exact_gzip_restore_verified: true,
    };
    const put = await controlPlane.fetch(request("/v1/hot-snapshot/risk-indices", "PUT", {
      value,
      proof,
      payload_sha256: createHash("sha256").update(payloadJson).digest("hex"),
      source_run_id: "17201234568",
    }), env);
    expect(put.status).toBe(200);
    const putResult = await put.json() as Record<string, unknown>;
    expect(putResult.verification_mode).toBe("global-risk-parent-projection");
    expect(putResult.b2_object_key).toBe(GLOBAL_RISK_KEY);
    expect(putResult.b2_sha256).toBe(parentB2Sha);

    const get = await controlPlane.fetch(request("/v1/public/hot-snapshot/risk-indices", "GET"), env);
    expect(get.status).toBe(200);
    const result = await get.json() as Record<string, unknown>;
    expect(result.verification_mode).toBe("global-risk-parent-projection");
    expect(result.proof_schema).toBe("geomacro.public-risk-indices-parent-projection-proof.v1");
    expect(result.b2_object_key).toBe(GLOBAL_RISK_KEY);

    const badProof = { ...proof, parent_payload_sha256: "d".repeat(64) };
    const rejected = await controlPlane.fetch(request("/v1/hot-snapshot/risk-indices", "PUT", {
      value: { ...value, parent_payload_sha256: badProof.parent_payload_sha256 },
      proof: badProof,
      payload_sha256: createHash("sha256")
        .update(JSON.stringify({ ...value, parent_payload_sha256: badProof.parent_payload_sha256 }))
        .digest("hex"),
      source_run_id: "17201234569",
    }), env);
    expect(rejected.status).toBe(400);
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
