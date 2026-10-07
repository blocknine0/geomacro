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
