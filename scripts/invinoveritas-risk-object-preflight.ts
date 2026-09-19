#!/usr/bin/env bun
/**
 * Geomacro -> invinoveritas interoperability preflight.
 *
 * The script verifies the exact signed Risk Object against Geomacro's deployed
 * verifier, proves a one-field tamper is rejected, requires freshness, and
 * constructs the documented invinoveritas /review request contract.
 *
 * It never modifies the signed input artifact.
 *
 * Usage:
 *   bun scripts/invinoveritas-risk-object-preflight.ts /path/to/risk-object.json
 *
 * Optional env:
 *   GEOMACRO_ORIGIN=https://geomacro.live
 *   INVINO_ORIGIN=https://api.babyblueviper.com
 *   INVINO_API_KEY=ivv_...          # enables the live /review call
 *   INVINO_REQUEST_OUT=/tmp/request.json
 */

import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  throw new Error(
    "Usage: bun scripts/invinoveritas-risk-object-preflight.ts <risk-object.json>",
  );
}

const geomacroOrigin = (
  process.env.GEOMACRO_ORIGIN ?? "https://geomacro.live"
).replace(/\/$/, "");
const invinoOrigin = (
  process.env.INVINO_ORIGIN ?? "https://api.babyblueviper.com"
).replace(/\/$/, "");
const invinoApiKey = process.env.INVINO_API_KEY?.trim() ?? "";
const requestOut = process.env.INVINO_REQUEST_OUT?.trim() ?? "";
const reviewOut = process.env.INVINO_REVIEW_OUT?.trim() ?? "";

const riskObject = JSON.parse(await readFile(file, "utf8"));

async function verify(object: unknown) {
  const response = await fetch(`${geomacroOrigin}/api/risk-object-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ risk_object: object }),
  });
  const body = await response.json();
  return { http_status: response.status, body };
}

const original = await verify(riskObject);
if (
  original.http_status !== 200 ||
  original.body?.ok !== true ||
  original.body?.verification?.status !== "VERIFIED" ||
  original.body?.verification?.valid !== true ||
  original.body?.verification?.cryptographic_valid !== true ||
  original.body?.verification?.contract_valid !== true ||
  original.body?.verification?.fresh !== true
) {
  throw new Error(
    `Original Risk Object failed deployed verification: ${JSON.stringify(original.body)}`,
  );
}

const tampered = structuredClone(riskObject);
if (typeof tampered?.risk?.score !== "number") {
  throw new Error("Risk Object does not contain numeric risk.score for tamper vector");
}
tampered.risk.score = Number((tampered.risk.score + 1).toFixed(6));

const tamperResult = await verify(tampered);
if (
  tamperResult.body?.verification?.valid === true ||
  tamperResult.body?.verification?.status === "VERIFIED"
) {
  throw new Error("Tampered Risk Object was incorrectly accepted");
}

const expiresAt = Date.parse(riskObject.expires_at);
if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
  throw new Error(
    "Risk Object is stale. Publish a fresh production-signed object before handoff.",
  );
}

/**
 * invinoveritas documents these /review artifact types:
 * trade | onchain_action | code_diff | plan | general (plus command variants).
 *
 * A signed external Risk Object is context rather than a proposed trade or
 * executable action, so use the supported neutral "general" type. The review
 * context explains how the artifact should be interpreted.
 *
 * sign=true requests the portable signed review proof.
 * hash_only keeps the reviewed content out of public disclosure surfaces.
 */
const reviewRequest = {
  artifact: JSON.stringify(riskObject),
  artifact_type: "general",
  context:
    "Pre-action external risk context from Geomacro. The artifact is a signed gro-1.1 geopolitical/macro Risk Object. Validate its stated risk context, confidence, evidence/provenance, integrity and freshness as an input to the caller's own decision gate. Geomacro does not authorize execution. Commercial delivery is derived-only and does not redistribute raw third-party source material.",
  sign: true,
  confidentiality_tier: "hash_only",
};

if (requestOut) {
  await writeFile(requestOut, JSON.stringify(reviewRequest, null, 2) + "\n", {
    mode: 0o600,
  });
}

let liveReview:
  | {
      attempted: false;
    }
  | {
      attempted: true;
      http_status: number;
      verdict: string;
      confidence: number | null;
      issue_count: number | null;
      proof_present: boolean;
      billing: unknown;
    } = { attempted: false };

if (invinoApiKey) {
  const response = await fetch(`${invinoOrigin}/review`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${invinoApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(reviewRequest),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `invinoveritas /review failed HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  const verdict = String(body?.verdict ?? "");
  if (!["approve", "approve_with_concerns", "concerns", "reject"].includes(verdict)) {
    throw new Error(
      `invinoveritas /review returned an unexpected verdict contract: ${JSON.stringify(body)}`,
    );
  }

  if (!body?.proof) {
    throw new Error(
      "invinoveritas /review was requested with sign=true but returned no proof",
    );
  }

  if (reviewOut) {
    await writeFile(
      reviewOut,
      JSON.stringify(body, null, 2) + "\n",
      { mode: 0o600 },
    );
  }

  liveReview = {
    attempted: true,
    http_status: response.status,
    verdict,
    confidence:
      typeof body?.confidence === "number" ? body.confidence : null,
    issue_count: Array.isArray(body?.issues) ? body.issues.length : null,
    proof_present: true,
    billing: body?.billing ?? null,
  };
}

console.log(
  JSON.stringify(
    {
      ok: true,
      gates: {
        deployed_original_verification: "PASS",
        tampered_payload_rejected: "PASS",
        freshness: "PASS",
        partner_request_contract: "PASS",
        live_partner_review: liveReview.attempted ? "PASS" : "NOT_RUN",
      },
      object: {
        object_id: riskObject.object_id,
        schema_version: riskObject.schema_version,
        expires_at: riskObject.expires_at,
        signing_key_id: riskObject?.integrity?.signing_key_id,
      },
      geomacro_verification: original.body.verification,
      tamper_verification:
        tamperResult.body?.verification ?? tamperResult.body,
      invinoveritas_request: {
        artifact_type: reviewRequest.artifact_type,
        sign: reviewRequest.sign,
        confidentiality_tier: reviewRequest.confidentiality_tier,
        context: reviewRequest.context,
        artifact_bytes: Buffer.byteLength(reviewRequest.artifact, "utf8"),
        request_written_to: requestOut || null,
        review_response_written_to: reviewOut || null,
      },
      live_review: liveReview,
      handoff_rule:
        "Immediately before partner testing, publish/retrieve a fresh production-signed GRO and rerun this preflight. Never extend expires_at or edit a signed artifact.",
    },
    null,
    2,
  ),
);
