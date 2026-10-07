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
