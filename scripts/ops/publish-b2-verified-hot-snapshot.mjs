import { createHash, createHmac } from "node:crypto";

const CONTROL_PLANE_URL = "https://geomacro-control-plane.daspallab202391.workers.dev";
const EXPECTED = Object.freeze({
  intelligence: {
    key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    proof: "geomacro.public-intelligence-live-proof.v1",
  },
  "global-risk": {
    key: "geomacro-evidence/v1/live/global-risk/latest.json.gz",
    proof: "geomacro.public-global-risk-live-proof.v1",
  },
  "risk-indices": {
    key: "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",
    proof: "geomacro.public-risk-indices-live-proof.v1",
  },
});

export async function publishB2VerifiedHotSnapshot({ product, value, proof }) {
  const expected = EXPECTED[product];
  if (!expected || !value || typeof value !== "object" || !proof || typeof proof !== "object") {
    throw new Error("HOT_SNAPSHOT_INPUT_INVALID");
  }
  if (
    proof.schema !== expected.proof ||
    proof.live_key !== expected.key ||
    proof.full_b2_readback_verified !== true ||
    proof.exact_gzip_restore_verified !== true ||
    proof.generated_at !== value.generated_at ||
    !/^[0-9a-f]{64}$/.test(String(proof.compressed_sha256 ?? ""))
  ) throw new Error("HOT_SNAPSHOT_B2_PROOF_INVALID");

  const root = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (root.length < 32) throw new Error("GEOMACRO_COMMERCE_LEDGER_TOKEN_REQUIRED");
  const token = createHmac("sha256", root).update("geomacro-control-plane-v1").digest("hex");
  const payloadJson = JSON.stringify(value);
  const payloadSha256 = createHash("sha256").update(payloadJson).digest("hex");
  const sourceRunId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  if (!/^\d{1,20}$/.test(sourceRunId)) throw new Error("HOT_SNAPSHOT_GITHUB_RUN_ID_REQUIRED");

  const response = await fetch(`${CONTROL_PLANE_URL}/v1/hot-snapshot/${product}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value, proof, payload_sha256: payloadSha256, source_run_id: sourceRunId }),
    signal: AbortSignal.timeout(15_000),
  });
  let result;
  try { result = await response.json(); } catch { result = null; }
  if (
    !response.ok ||
    result?.ok !== true ||
    result?.product !== product ||
    result?.b2_object_key !== expected.key ||
    result?.b2_sha256 !== proof.compressed_sha256 ||
    result?.payload_sha256 !== payloadSha256 ||
    result?.full_b2_readback_verified !== true ||
    result?.exact_gzip_restore_verified !== true
  ) throw new Error(`HOT_SNAPSHOT_D1_PUBLISH_FAILED_${response.status}`);
  return result;
}


const GLOBAL_RISK_PARENT = Object.freeze({
  key: "geomacro-evidence/v1/live/global-risk/latest.json.gz",
  proof: "geomacro.public-risk-indices-parent-projection-proof.v1",
});

export async function publishParentVerifiedRiskIndicesHotSnapshot({ value, proof }) {
  if (!value || typeof value !== "object" || !proof || typeof proof !== "object") {
    throw new Error("RISK_INDICES_PARENT_PROJECTION_INPUT_INVALID");
  }
  if (
    value.schema !== "geomacro.public-risk-indices-live.v1" ||
    proof.schema !== GLOBAL_RISK_PARENT.proof ||
    proof.parent_product !== "global-risk" ||
    proof.live_key !== GLOBAL_RISK_PARENT.key ||
    proof.full_b2_readback_verified !== true ||
    proof.exact_gzip_restore_verified !== true ||
    proof.generated_at !== value.generated_at ||
    proof.snapshot_id !== value.data?.snapshotId ||
    Date.parse(String(proof.snapshot_as_of ?? "")) !== Date.parse(String(value.data?.snapshotAsOf ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(proof.compressed_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(proof.parent_payload_sha256 ?? ""))
  ) throw new Error("RISK_INDICES_PARENT_PROJECTION_PROOF_INVALID");

  const root = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (root.length < 32) throw new Error("GEOMACRO_COMMERCE_LEDGER_TOKEN_REQUIRED");
  const token = createHmac("sha256", root).update("geomacro-control-plane-v1").digest("hex");
  const payloadJson = JSON.stringify(value);
  const payloadSha256 = createHash("sha256").update(payloadJson).digest("hex");
  const sourceRunId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  if (!/^\d{1,20}$/.test(sourceRunId)) throw new Error("HOT_SNAPSHOT_GITHUB_RUN_ID_REQUIRED");

  const requestBody = JSON.stringify({
    value,
    proof,
    payload_sha256: payloadSha256,
    source_run_id: sourceRunId,
  });
  let lastStatus = 0;
  let lastResult = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await fetch(`${CONTROL_PLANE_URL}/v1/hot-snapshot/risk-indices`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
      signal: AbortSignal.timeout(15_000),
    });
    lastStatus = response.status;
    try { lastResult = await response.json(); } catch { lastResult = null; }
    if (
      response.ok &&
      lastResult?.ok === true &&
      lastResult?.product === "risk-indices" &&
      lastResult?.verification_mode === "global-risk-parent-projection" &&
      lastResult?.b2_object_key === GLOBAL_RISK_PARENT.key &&
      lastResult?.b2_sha256 === proof.compressed_sha256 &&
      lastResult?.payload_sha256 === payloadSha256 &&
      lastResult?.full_b2_readback_verified === true &&
      lastResult?.exact_gzip_restore_verified === true
    ) return lastResult;

    if (![400, 404, 429, 502, 503, 504].includes(response.status) || attempt === 10) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(4_000, attempt * 500)));
  }
  throw new Error(`RISK_INDICES_PARENT_PROJECTION_D1_PUBLISH_FAILED_${lastStatus}`);
}
