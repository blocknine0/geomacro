import { createHash, createHmac } from "node:crypto";
import { qualifyIndependentSameEvent } from "../lib/independent-same-event-qualification.mjs";

const CONTROL_PLANE_URL = "https://geomacro-control-plane.daspallab202391.workers.dev";

const GLOBAL_RISK_CURRENT_PROOF_SCHEMA = "geomacro.public-global-risk-current-proof.v1";
const GLOBAL_RISK_CURRENT_PROOF_MODE = "independent-gri-proof-over-b2-baseline";

function controlPlaneAuth() {
  const root = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (root.length < 32) throw new Error("GEOMACRO_COMMERCE_LEDGER_TOKEN_REQUIRED");
  return createHmac("sha256", root).update("geomacro-control-plane-v1").digest("hex");
}

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

export async function publishB2VerifiedHotSnapshot({ product, value, proof, privateEventPackages }) {
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

  // Intelligence news must NEVER be promoted from one article, syndication
  // duplicates or raw GDELT observations. Check private source evidence
  // before using credentials or sending a D1 publication request.
  if(product==="intelligence"){
    const attestedAt=Date.parse(String(proof.commercial_multi_source_checked_at??""));
    if(!Number.isFinite(attestedAt)||Math.abs(Date.now()-attestedAt)>5*60_000)
      throw Error("HOT_SNAPSHOT_MULTI_SOURCE_ATTESTATION_STALE");
    const result=qualifyIndependentSameEvent({
      rows:value.rows,eventPackages:privateEventPackages,
      now:new Date(attestedAt),
      trustedReviewerPublicKeyPem:process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
    });
    if(proof.commercial_multi_source_verified!==true||
       proof.commercial_multi_source_receipt_sha256!==result.receipt_sha256||
       proof.commercial_multi_source_qualified_count!==value.rows.length||
       result.receipt.qualified_event_count!==value.rows.length||
       result.receipt.commercial_event_admission!==true)
      throw Error("HOT_SNAPSHOT_MULTI_SOURCE_PROOF_INVALID");
    // Private article URLs/title/rights evidence is NEVER serialized into
    // D1, public B2 proof, webhook data or a customer response.
  }

  const token = controlPlaneAuth();
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


export async function readGlobalRiskB2Anchor() {
  const token = controlPlaneAuth();
  const response = await fetch(`${CONTROL_PLANE_URL}/v1/hot-snapshot-anchor/global-risk`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(15_000),
  });
  let result;
  try { result = await response.json(); } catch { result = null; }
  if (
    !response.ok ||
    result?.ok !== true ||
    result?.schema !== "geomacro.global-risk-b2-anchor.v1" ||
    result?.product !== "global-risk" ||
    result?.b2_object_key !== EXPECTED["global-risk"].key ||
    !/^[0-9a-f]{64}$/.test(String(result?.b2_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(result?.payload_sha256 ?? "")) ||
    !/^\d{1,20}$/.test(String(result?.source_run_id ?? "")) ||
    !Number.isFinite(Date.parse(String(result?.generated_at ?? ""))) ||
    result?.baseline_b2_readback_verified !== true ||
    result?.baseline_exact_gzip_restore_verified !== true
  ) throw new Error(`GLOBAL_RISK_B2_ANCHOR_UNAVAILABLE_${response.status}`);
  return result;
}

export async function publishVerifiedCurrentGlobalRiskHotSnapshot({ value, proof }) {
  if (!value || typeof value !== "object" || !proof || typeof proof !== "object") {
    throw new Error("GLOBAL_RISK_CURRENT_PROOF_INPUT_INVALID");
  }
  if (
    value.schema !== "geomacro.public-global-risk-live.v1" ||
    value.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
    value.current_b2_snapshot_promoted !== false ||
    proof.schema !== GLOBAL_RISK_CURRENT_PROOF_SCHEMA ||
    proof.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
    proof.live_key !== EXPECTED["global-risk"].key ||
    proof.generated_at !== value.generated_at ||
    proof.snapshot_id !== value.data?.snapshotId ||
    Date.parse(String(proof.snapshot_as_of ?? "")) !== Date.parse(String(value.data?.snapshotAsOf ?? "")) ||
    proof.independent_gri_proof_verified !== true ||
    proof.baseline_b2_readback_verified !== true ||
    proof.baseline_exact_gzip_restore_verified !== true ||
    proof.current_b2_readback_verified !== false ||
    proof.current_b2_snapshot_promoted !== false ||
    !/^[0-9a-f]{64}$/.test(String(proof.baseline_b2_sha256 ?? "")) ||
    !/^[0-9a-f]{64}$/.test(String(proof.baseline_payload_sha256 ?? "")) ||
    !/^\d{1,20}$/.test(String(proof.baseline_source_run_id ?? "")) ||
    !Number.isFinite(Date.parse(String(proof.baseline_generated_at ?? ""))) ||
    proof.baseline_b2_sha256 !== value.baseline_b2_sha256 ||
    proof.baseline_payload_sha256 !== value.baseline_payload_sha256 ||
    String(proof.baseline_source_run_id) !== String(value.baseline_source_run_id) ||
    Date.parse(String(proof.baseline_generated_at)) !== Date.parse(String(value.baseline_generated_at))
  ) throw new Error("GLOBAL_RISK_CURRENT_PROOF_INVALID");

  const token = controlPlaneAuth();
  const payloadJson = JSON.stringify(value);
  const payloadSha256 = createHash("sha256").update(payloadJson).digest("hex");
  const sourceRunId = String(process.env.GITHUB_RUN_ID ?? "").trim();
  if (!/^\d{1,20}$/.test(sourceRunId)) throw new Error("HOT_SNAPSHOT_GITHUB_RUN_ID_REQUIRED");

  const response = await fetch(`${CONTROL_PLANE_URL}/v1/hot-snapshot/global-risk`, {
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
    result?.product !== "global-risk" ||
    result?.verification_mode !== GLOBAL_RISK_CURRENT_PROOF_MODE ||
    result?.b2_object_key !== EXPECTED["global-risk"].key ||
    result?.b2_sha256 !== proof.baseline_b2_sha256 ||
    result?.payload_sha256 !== payloadSha256 ||
    result?.baseline_b2_readback_verified !== true ||
    result?.baseline_exact_gzip_restore_verified !== true ||
    result?.current_b2_readback_verified !== false ||
    result?.current_b2_snapshot_promoted !== false
  ) throw new Error(`GLOBAL_RISK_CURRENT_PROOF_D1_PUBLISH_FAILED_${response.status}`);
  return result;
}
