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

import {
  createHash,
} from "node:crypto";
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonicalize(
            (value as Record<string, unknown>)[key],
          ),
        ]),
    );
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Non-finite number in reproducibility manifest");
  }

  return value;
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(canonicalize(value)),
      "utf8",
    )
    .digest("hex");
}

const strictProfile =
  riskObject?.provenance?.reproducibility?.calculation_namespace ===
  "federico_strict_evidence_v1";

async function verify(object: unknown) {
  const response = await fetch(`${geomacroOrigin}/api/risk-object-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ risk_object: object }),
  });
  const body = await response.json();
  return { http_status: response.status, body };
}

if (
  strictProfile &&
  riskObject?.decision_readiness?.status !== "READY"
) {
  throw new Error(
    `Federico strict decision-readiness failed: ${JSON.stringify(
      riskObject?.decision_readiness,
    )}`,
  );
}

if (
  strictProfile &&
  (
    riskObject?.integrity?.trust_registry_url !==
      "https://geomacro.live/api/risk-object-keys" ||
    !riskObject?.integrity?.canonicalization_url ||
    !riskObject?.integrity?.public_key_spki_b64
  )
) {
  throw new Error(
    "Federico strict object is missing actionable public trust metadata",
  );
}

if (strictProfile) {
  const registryUrl =
    riskObject.integrity.trust_registry_url;

  const registryResponse =
    await fetch(registryUrl);
  const registry =
    await registryResponse.json();

  const trusted =
    Array.isArray(registry?.keys)
      ? registry.keys.find(
          (item: any) =>
            item?.key_id ===
            riskObject.integrity.signing_key_id,
        )
      : null;

  if (
    !trusted ||
    trusted.status !== "active" ||
    trusted.public_key_spki_b64 !==
      riskObject.integrity.public_key_spki_b64
  ) {
    throw new Error(
      "Embedded Risk Object public key does not match the active public trust registry",
    );
  }

  const manifest =
    riskObject?.provenance?.reproducibility;

  if (
    !manifest?.calculation_input ||
    !manifest?.hash_inputs?.data_projection ||
    !manifest?.score_components ||
    !manifest?.selection_policy?.source_family_map_version ||
    !manifest?.selection_policy?.source_family_map
  ) {
    throw new Error(
      "Federico strict object is missing the signed reproducibility manifest",
    );
  }

  const recomputedInputHash =
    sha256Canonical(
      manifest.calculation_input,
    );

  if (
    recomputedInputHash !==
    riskObject.integrity.input_hash
  ) {
    throw new Error(
      "Reproducibility manifest input_hash mismatch",
    );
  }

  const recomputedDataHash =
    sha256Canonical(
      manifest.hash_inputs.data_projection,
    );

  if (
    recomputedDataHash !==
    riskObject.integrity.data_hash
  ) {
    throw new Error(
      "Reproducibility manifest data_hash mismatch",
    );
  }

  const manifestEvents =
    Array.isArray(
      manifest.calculation_input.events,
    )
      ? manifest.calculation_input.events
      : [];

  const totalWeight =
    manifestEvents.reduce(
      (sum: number, event: any) =>
        sum + Number(event.weight ?? 0),
      0,
    );

  const rawScore =
    totalWeight > 0
      ? manifestEvents.reduce(
          (sum: number, event: any) =>
            sum +
            Number(event.severity ?? 0) *
              Number(event.weight ?? 0),
          0,
        ) / totalWeight
      : 0;

  const aggregateConfidence =
    totalWeight > 0
      ? manifestEvents.reduce(
          (sum: number, event: any) =>
            sum +
            Number(event.confidence ?? 0) *
              Number(event.weight ?? 0),
          0,
        ) / totalWeight / 100
      : 0;

  const roundedScore =
    Math.round(
      Math.max(
        0,
        Math.min(100, rawScore),
      ) * 10,
    ) / 10;

  if (
    Math.abs(
      roundedScore -
        Number(
          manifest.score_components.rounded_score,
        ),
    ) > 1e-9 ||
    Math.abs(
      totalWeight -
        Number(
          manifest.score_components.total_weight,
        ),
    ) > 1e-6 ||
    Math.abs(
      rawScore -
        Number(
          manifest.score_components.raw_score,
        ),
    ) > 1e-6 ||
    Math.abs(
      aggregateConfidence -
        Number(
          manifest.score_components.aggregate_confidence,
        ),
    ) > 1e-6
  ) {
    throw new Error(
      "Reproducibility manifest score components cannot be recomputed from its calculation input",
    );
  }

  const recomputedCalculationHash =
    sha256Canonical({
      input_hash:
        riskObject.integrity.input_hash,
      score:
        riskObject.risk.score,
      previous_score:
        riskObject.risk.previous_score,
      delta:
        riskObject.risk.delta,
      attribution:
        riskObject.attribution,
    });

  if (
    recomputedCalculationHash !==
    riskObject.integrity.calculation_hash
  ) {
    throw new Error(
      "Reproducibility manifest calculation_hash mismatch",
    );
  }

  const evidence =
    Array.isArray(riskObject.evidence)
      ? riskObject.evidence
      : [];

  if (
    evidence.some(
      (item: any) =>
        !Array.isArray(item.source_urls) ||
        item.source_urls.length === 0 ||
        !item.relevance_reason ||
        !item.transmission_channel ||
        !Array.isArray(item.source_record_ids) ||
        item.source_record_ids.length === 0 ||
        !Array.isArray(item.content_hashes) ||
        item.content_hashes.length === 0 ||
        typeof item.subject_is_primary !== "boolean" ||
        typeof item.subject_attribution_confidence !== "number" ||
        !item.subject_attribution_method ||
        typeof item.relevance_weight !== "number" ||
        item.relevance_weight <= 0 ||
        item.relevance_weight > 1 ||
        !Array.isArray(item.source_families) ||
        item.source_families.length === 0 ||
        Number(item.evidence_age_hours ?? 999) >
          6
    )
  ) {
    throw new Error(
      "Federico strict evidence is missing attributable source URLs, relevance metadata or freshness bounds",
    );
  }

  const configuredSourceFamilyMap =
    manifest.selection_policy.source_family_map as Record<
      string,
      string
    >;

  const configuredSourceFamilies =
    new Set(
      Object.values(
        configuredSourceFamilyMap,
      ),
    );

  if (
    evidence.some(
      (item: any) =>
        (item.source_ids ?? []).some(
          (sourceId: string) =>
            !Object.prototype.hasOwnProperty.call(
              configuredSourceFamilyMap,
              sourceId,
            ),
        ) ||
        (item.source_families ?? []).some(
          (family: string) =>
            !configuredSourceFamilies.has(family),
        )
    )
  ) {
    throw new Error(
      "Federico strict evidence contains an unmapped source identity: " + JSON.stringify(evidence.map((item: any) => ({ source_ids: item.source_ids, source_families: item.source_families }))),
    );
  }

  if (
    evidence.some(
      (item: any) =>
        Number(item.severity ?? 0) >= 70 &&
        /conflict|military|attack|escalat/i.test(
          String(item.event_type ?? ""),
        ) &&
        (
          item.corroboration_status !==
            "CONFIRMED" ||
          Number(item.evidence_age_hours ?? 999) >
            3
        )
    )
  ) {
    throw new Error(
      "Federico strict high-impact evidence gate failed",
    );
  }
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
const reviewArtifact = {
  artifact_version: "geomacro-invino-review-v1",
  object_id: riskObject.object_id,
  schema_version: riskObject.schema_version,
  issuer: riskObject.issuer,
  subject: riskObject.subject,
  risk: riskObject.risk,
  confidence: riskObject.confidence ?? null,
  as_of: riskObject.as_of ?? riskObject.calculation_input?.as_of ?? null,
  expires_at: riskObject.expires_at,
  verification: riskObject.verification ?? null,
  decision_readiness: riskObject.decision_readiness ?? null,
  commercial_eligibility: riskObject.commercial_eligibility ?? null,
  evidence_summary: riskObject.evidence_summary ?? null,
  attribution: riskObject.attribution ?? null,
  score_components: riskObject.score_components ?? null,
  calculation: riskObject.calculation_input
    ? {
        as_of: riskObject.calculation_input.as_of,
        event_count: Array.isArray(riskObject.calculation_input.events)
          ? riskObject.calculation_input.events.length
          : riskObject.calculation_input.event_count ?? null,
        lookback_hours: riskObject.calculation_input.lookback_hours ?? null,
        half_life_hours: riskObject.calculation_input.half_life_hours ?? null,
        methodology: riskObject.calculation_input.methodology ?? null,
      }
    : null,
  integrity: riskObject.integrity
    ? {
        data_hash: riskObject.integrity.data_hash,
        input_hash: riskObject.integrity.input_hash,
        payload_hash: riskObject.integrity.payload_hash,
        calculation_hash: riskObject.integrity.calculation_hash,
        signing_key_id: riskObject.integrity.signing_key_id,
        signature_scheme: riskObject.integrity.signature_scheme,
        canonicalization: riskObject.integrity.canonicalization,
      }
    : null,
};

const reviewArtifactText = JSON.stringify(reviewArtifact);
const reviewArtifactBytes = Buffer.byteLength(reviewArtifactText, "utf8");
if (reviewArtifactBytes > 20_000) {
  throw new Error(
    `Compact invinoveritas review artifact exceeds the partner limit: ${reviewArtifactBytes} bytes > 20000`,
  );
}

const reviewRequest = {
  artifact: reviewArtifactText,
  artifact_type: "general",
  context:
    "Pre-action external risk context from Geomacro. The review artifact is a compact decision summary of a separately preserved signed gro-1.1 Risk Object. The complete signed object remains intact in the handoff artifact and is independently verified by Geomacro before this request. Validate the stated risk context, confidence, evidence/provenance summary, integrity identifiers, decision readiness and freshness as inputs to the caller's own decision gate. Do not treat the review as execution authorization. Commercial delivery is derived-only and does not redistribute raw third-party source material.",
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
      blocker_count: number;
      high_count: number;
      medium_count: number;
      low_count: number;
      admission_clear: boolean;
      proof_present: boolean;
      proof_verification?: {
        primary: boolean;
        independent_node: boolean;
        verify_url: string | null;
        independent_node_url: string | null;
      };
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

  const issues =
    Array.isArray(body?.issues)
      ? body.issues
      : [];

  const severityCount = (severity: string) =>
    issues.filter(
      (issue: any) =>
        String(issue?.severity ?? "").toLowerCase() === severity,
    ).length;

  const blockerCount = severityCount("blocker");
  const highCount = severityCount("high");
  const mediumCount = severityCount("medium");
  const lowCount = severityCount("low");

  let proofVerification = {
    primary: false,
    independent_node: false,
    verify_url: null as string | null,
    independent_node_url: null as string | null,
  };

  const signedEvent =
    body?.proof?.event;

  if (
    signedEvent &&
    body?.proof?.proof_payload
  ) {
    const verifyUrl =
      String(
        body.proof.proof_payload.verify_url ??
          "",
      ).trim();

    if (verifyUrl) {
      const verifyResponse =
        await fetch(verifyUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            event: signedEvent,
          }),
        });

      const verifyBody =
        await verifyResponse
          .json()
          .catch(() => null);

      if (!verifyResponse.ok || verifyBody?.valid !== true) {
        throw new Error(
          `invinoveritas primary /verify-proof failed: ${JSON.stringify(
            verifyBody,
          )}`,
        );
      }

      proofVerification.primary = true;
      proofVerification.verify_url = verifyUrl;
    }

    const independentNodes =
      Array.isArray(
        body.proof.proof_payload.independent_nodes,
      )
        ? body.proof.proof_payload.independent_nodes
        : [];

    const independentNode =
      String(independentNodes[0] ?? "").trim();

    if (independentNode) {
      const independentResponse =
        await fetch(independentNode, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            event: signedEvent,
          }),
        });

      const independentBody =
        await independentResponse
          .json()
          .catch(() => null);

      if (
        !independentResponse.ok ||
        independentBody?.valid !== true
      ) {
        throw new Error(
          `invinoveritas independent-node proof verification failed: ${JSON.stringify(
            independentBody,
          )}`,
        );
      }

      proofVerification.independent_node = true;
      proofVerification.independent_node_url =
        independentNode;
    }
  }

  if (
    !proofVerification.primary ||
    !proofVerification.independent_node
  ) {
    throw new Error(
      "Signed partner proof could not be independently verified against the primary and independent verifier nodes",
    );
  }

  const admissionClear =
    ["approve", "approve_with_concerns"].includes(verdict) &&
    blockerCount === 0 &&
    highCount === 0;

  liveReview = {
    attempted: true,
    http_status: response.status,
    verdict,
    confidence:
      typeof body?.confidence === "number" ? body.confidence : null,
    issue_count: issues.length,
    blocker_count: blockerCount,
    high_count: highCount,
    medium_count: mediumCount,
    low_count: lowCount,
    admission_clear: admissionClear,
    proof_present: true,
    proof_verification: proofVerification,
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
        partner_admission:
          liveReview.attempted && liveReview.admission_clear
            ? "PASS"
            : liveReview.attempted
              ? "FAIL"
              : "NOT_RUN",
        partner_proof_verification:
          liveReview.attempted &&
          liveReview.proof_verification?.primary === true &&
          liveReview.proof_verification?.independent_node === true
            ? "PASS"
            : liveReview.attempted
              ? "FAIL"
              : "NOT_RUN",
        trust_metadata: strictProfile ? "PASS" : "NOT_APPLICABLE",
        reproducibility: strictProfile ? "PASS" : "NOT_APPLICABLE",
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
        artifact_bytes: reviewArtifactBytes,
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
