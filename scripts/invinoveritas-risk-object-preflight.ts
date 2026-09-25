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
  createPublicKey,
  verify as verifySignatureBytes,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  FEDERICO_STRICT_MAX_INCLUDED_EVIDENCE_ITEMS,
  federicoStrictSourceFamilyForId,
} from "../src/lib/public-demo-risk-profile";

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
const invinoDemoApiKey = process.env.INVINO_DEMO_API_KEY?.trim() ?? "";
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
  !["READY", "DEGRADED"].includes(
    String(riskObject?.decision_readiness?.status ?? ""),
  )
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

const observedAt =
  typeof riskObject?.observed_at === "string" &&
  riskObject.observed_at.trim().length > 0
    ? riskObject.observed_at
    : null;

if (strictProfile && !observedAt) {
  throw new Error(
    "Federico strict Risk Object must contain observed_at for review as_of binding",
  );
}

let registryUrl = riskObject?.integrity?.trust_registry_url ?? "";
let trusted: any = null;
let registry: any = null;
let registryFetchedAt: string | null = null;
let registryHttpDate: string | null = null;
let registryResponseSha256: string | null = null;
let trustedKeyFingerprintSha256: string | null = null;
let trustedClockMs: number | null = null;
let expiresAtMsForAttestation: number | null = null;

if (strictProfile) {
  registryUrl =
    riskObject.integrity.trust_registry_url;

  const registryResponse =
    await fetch(registryUrl);
  if (!registryResponse.ok) {
    throw new Error(
      "Risk Object trust registry fetch failed HTTP " +
        registryResponse.status,
    );
  }
  registry =
    await registryResponse.json();
  registryFetchedAt = new Date().toISOString();
  registryHttpDate = registryResponse.headers.get("date");
  if (!registryHttpDate || !Number.isFinite(Date.parse(registryHttpDate))) {
    throw new Error(
      "Risk Object trust registry did not provide a valid HTTP Date header for trusted freshness attestation",
    );
  }

  trusted =
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

  registryResponseSha256 = sha256Canonical(registry);
  trustedKeyFingerprintSha256 = createHash("sha256")
    .update(Buffer.from(riskObject.integrity.public_key_spki_b64, "base64"))
    .digest("hex");

  trustedClockMs = Date.parse(registryHttpDate);
  expiresAtMsForAttestation = Date.parse(riskObject.expires_at);
  if (
    !Number.isFinite(expiresAtMsForAttestation) ||
    !Number.isFinite(trustedClockMs) ||
    trustedClockMs >= expiresAtMsForAttestation
  ) {
    throw new Error(
      "Federico strict trusted registry clock is not strictly before Risk Object expiry",
    );
  }

  const manifest =
    riskObject?.provenance?.reproducibility;

  if (
    !manifest?.calculation_input ||
    !manifest?.hash_inputs?.data_projection_version ||
    !manifest?.hash_inputs?.data_projection_sha256 ||
    !manifest?.score_components ||
    !manifest?.selection_policy?.max_included_evidence_items ||
    !manifest?.selection_policy?.source_family_map_version ||
    !manifest?.selection_policy?.source_family_map
  ) {
    throw new Error(
      "Federico strict object is missing the signed compact reproducibility manifest",
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

  if (
    manifest.hash_inputs.data_projection_version !==
    "country-risk-data-projection-v2"
  ) {
    throw new Error(
      "Unsupported Federico strict data projection version",
    );
  }

  const evidenceForDataProjection =
    Array.isArray(riskObject.evidence)
      ? riskObject.evidence
      : [];

  if (
    evidenceForDataProjection.some(
      (item: any) =>
        Object.prototype.hasOwnProperty.call(item, "source_urls") ||
        Object.prototype.hasOwnProperty.call(item, "source_families") ||
        Object.prototype.hasOwnProperty.call(item, "relevance_reason") ||
        Object.prototype.hasOwnProperty.call(item, "transmission_channel") ||
        Object.prototype.hasOwnProperty.call(item, "subject_is_primary") ||
        Object.prototype.hasOwnProperty.call(item, "last_seen_at") ||
        Object.prototype.hasOwnProperty.call(item, "evidence_refs")
    )
  ) {
    throw new Error(
      "Federico strict compact evidence contains legacy duplicated provenance fields",
    );
  }

  const strictDataProjection = {
    country_iso3: riskObject?.subject?.id ?? null,
    evidence: evidenceForDataProjection.map((item: any) => ({
      event_id: item.event_id,
      event_family_id: item.event_family_id ?? null,
      source_ids: Array.isArray(item.source_ids) ? item.source_ids : [],
      source_record_ids: Array.isArray(item.source_record_ids)
        ? item.source_record_ids
        : [],
      content_hashes: Array.isArray(item.content_hashes)
        ? item.content_hashes
        : [],
      material_evidence_at: item.material_evidence_at ?? null,
      evidence_age_hours: item.evidence_age_hours,
      relevance_weight: item.relevance_weight ?? 1,
      subject_attribution_confidence:
        item.subject_attribution_confidence ?? null,
      subject_attribution_method:
        item.subject_attribution_method ?? null,
    })),
  };

  const recomputedDataHash =
    sha256Canonical(strictDataProjection);

  if (
    recomputedDataHash !==
    riskObject.integrity.data_hash ||
    manifest.hash_inputs.data_projection_sha256 !==
      riskObject.integrity.data_hash
  ) {
    throw new Error(
      "Reproducibility compact data projection hash mismatch",
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
      Math.round(aggregateConfidence * 10_000) / 10_000 -
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
    strictProfile &&
    (
      Number(
        manifest.selection_policy.max_included_evidence_items,
      ) !== FEDERICO_STRICT_MAX_INCLUDED_EVIDENCE_ITEMS ||
      evidence.length >
        FEDERICO_STRICT_MAX_INCLUDED_EVIDENCE_ITEMS
    )
  ) {
    throw new Error(
      "Federico strict evidence selection exceeds the signed bounded review profile",
    );
  }

  if (
    evidence.some(
      (item: any) =>
        !Array.isArray(item.source_ids) ||
        item.source_ids.length === 0 ||
        !Array.isArray(item.source_record_ids) ||
        item.source_record_ids.length === 0 ||
        !Array.isArray(item.content_hashes) ||
        item.content_hashes.length === 0 ||
        typeof item.subject_attribution_confidence !== "number" ||
        !item.subject_attribution_method ||
        typeof item.relevance_weight !== "number" ||
        item.relevance_weight <= 0 ||
        item.relevance_weight > 1 ||
        typeof item.material_evidence_at !== "string" ||
        item.material_evidence_at.length === 0 ||
        Number(item.evidence_age_hours ?? 999) > 6
    )
  ) {
    throw new Error(
      "Federico strict compact evidence is missing source identity, attribution metadata or freshness bounds",
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

  for (const item of evidence) {
    const sourceIds = Array.isArray(item.source_ids)
      ? item.source_ids.map(String).map((value: string) => value.trim().toLowerCase()).filter(Boolean)
      : [];
    const sourceFamilies = new Set(
      sourceIds.map((sourceId: string) =>
        federicoStrictSourceFamilyForId(sourceId),
      ),
    );

    for (const sourceId of sourceIds) {
      const configuredFamily = configuredSourceFamilyMap[sourceId];
      const resolvedFamily = federicoStrictSourceFamilyForId(sourceId);

      if (!configuredFamily) {
        throw new Error(
          "Federico strict evidence source identity is absent from its signed runtime map: " +
            JSON.stringify({ source_id: sourceId, source_family: resolvedFamily }),
        );
      }

      if (configuredFamily !== resolvedFamily) {
        throw new Error(
          "Federico strict source-family resolution mismatch: " +
            JSON.stringify({
              source_id: sourceId,
              configured_family: configuredFamily,
              resolved_family: resolvedFamily,
            }),
        );
      }

      if (!configuredSourceFamilies.has(configuredFamily)) {
        throw new Error(
          "Federico strict evidence contains a source family absent from its signed runtime map: " +
            JSON.stringify({ source_id: sourceId, source_family: configuredFamily }),
        );
      }
    }

    for (const family of sourceFamilies) {
      if (!configuredSourceFamilies.has(family)) {
        throw new Error(
          "Federico strict evidence contains a source family absent from its signed runtime map: " +
            JSON.stringify({
              source_ids: sourceIds,
              source_family: family,
            }),
        );
      }
    }
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

const receiverControlledTrustAnchor = {
  key_id: String(riskObject.integrity.signing_key_id ?? ""),
  public_key_fingerprint_sha256: trustedKeyFingerprintSha256,
  policy: "receiver_controlled_out_of_band_pin",
};

if (
  strictProfile &&
  receiverControlledTrustAnchor.public_key_fingerprint_sha256 !==
    "432f35218570c80c09d56a8005390f6d3111a932ba93298f4ffd86d9896c0b90"
) {
  throw new Error(
    "Federico strict signing key fingerprint is not the approved receiver-controlled pin",
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
 * partial_disclosure publishes a deliberately bounded summary while keeping
 * the full signed Risk Object available as exact external evidence for the
 * review. This is required because hash_only semantically means the reviewed
 * content is never disclosed, while this interoperability preflight explicitly
 * supplies the exact Risk Object record to the verifier.
 */
const signedRiskObjectRecord = JSON.stringify(canonicalize(riskObject));
const signedRiskObjectRecordSha256 = sha256Canonical(riskObject);

const signableRiskObject = structuredClone(riskObject);
signableRiskObject.integrity = {
  ...signableRiskObject.integrity,
  payload_hash: null,
  signature: null,
};
const canonicalSignedBytes = JSON.stringify(canonicalize(signableRiskObject));
const recomputedPayloadHash = createHash("sha256")
  .update(canonicalSignedBytes, "utf8")
  .digest("hex");
if (recomputedPayloadHash !== riskObject.integrity.payload_hash) {
  throw new Error(
    "Federico cryptographic attestation payload_hash mismatch",
  );
}

const publicKey = createPublicKey({
  key: Buffer.from(riskObject.integrity.public_key_spki_b64, "base64"),
  format: "der",
  type: "spki",
});
const signatureValid = verifySignatureBytes(
  null,
  Buffer.from(canonicalSignedBytes, "utf8"),
  publicKey,
  Buffer.from(riskObject.integrity.signature, "base64"),
);
if (!signatureValid) {
  throw new Error(
    "Federico cryptographic attestation Ed25519 signature verification failed",
  );
}

const deployedVerificationSummary = {
  verifier_url:
    geomacroOrigin + "/api/risk-object-keys",
  http_status: original.http_status,
  status: original.body?.verification?.status ?? null,
  valid: original.body?.verification?.valid ?? false,
  cryptographic_valid:
    original.body?.verification?.cryptographic_valid ?? false,
  contract_valid:
    original.body?.verification?.contract_valid ?? false,
  fresh: original.body?.verification?.fresh ?? false,
};

const externalEvidence = [{
  source: "Geomacro",
  record_sha256: signedRiskObjectRecordSha256,
  evidence_type: "signed_risk_object",
  record: signedRiskObjectRecord,
  observed_at: observedAt,
  validity_until: riskObject.expires_at,
}];

if (
  strictProfile &&
  (
    externalEvidence.length !== 1 ||
    externalEvidence[0]?.record_sha256 !== signedRiskObjectRecordSha256 ||
    externalEvidence[0]?.observed_at !== observedAt ||
    externalEvidence[0]?.validity_until !== riskObject.expires_at ||
    externalEvidence[0]?.record !== signedRiskObjectRecord
  )
) {
  throw new Error(
    "Federico strict external evidence failed its exact signed-object self-consistency check",
  );
}

const reviewArtifact = {
  artifact_version: "geomacro-invino-review-v6",
  action_proposed: true,
  action:
    "Admit this exact Geomacro gro-1.1 Risk Object only as read-only external context after receiver-side verification passes. Reject on any verification, provenance, trust, freshness, or integrity failure. This review never authorizes an irreversible action.",
  execution_authorized: false,
  admission_contract: {
    exact_evidence_binding:
      "Bind the receiver's decision to the exact external_evidence[0].record bytes and external_evidence[0].record_sha256.",
    independent_verification_required: true,
    issuer_attestations_are_not_trust_roots: true,
    trust_anchor_policy:
      "The receiving system controls the approved Geomacro signing-key fingerprint out of band. An online Geomacro registry response is discovery evidence, not the sole trust root.",
    required_checks: [
      "Hash the exact received record bytes.",
      "Parse and canonicalize the exact gro-1.1 record using pinned geomacro-canonical-json-v1.",
      "Recompute integrity.payload_hash from the canonical signable record and verify Ed25519.",
      "Resolve signing_key_id against the receiver-controlled approved key fingerprint and lifecycle policy.",
      "Obtain receiver-controlled trusted current UTC time at admission and require now < expires_at.",
      "Repeat the trusted-time and expiry check immediately before any irreversible downstream action and fail closed at or after expiry.",
      "Treat issuer-provided source counts, source-family labels, readiness, confidence, and historical freshness attestations as untrusted until independently validated.",
      "Require auditable source-specific country nexus and substantive source-family diversity before using the context for downstream risk decisions.",
    ],
    failure_posture:
      "Any unavailable trust anchor, verification mismatch, weak provenance, stale context, or uncalibrated decision input keeps the object read-only or inadmissible.",
  },
  freshness_policy: {
    observed_at: riskObject.observed_at,
    expires_at: riskObject.expires_at,
    admission_rule:
      "At admission obtain a fresh receiver-controlled trusted UTC time and require now < expires_at. Recheck immediately before irreversible execution and fail closed at or after expiry.",
    caller_time_not_trusted: true,
    decision_time_revalidation_required: true,
    fail_closed_at_or_after: riskObject.expires_at,
  },
  external_evidence: [{
    source: externalEvidence[0].source,
    record_sha256: externalEvidence[0].record_sha256,
    evidence_type: externalEvidence[0].evidence_type,
    record: externalEvidence[0].record,
    observed_at: externalEvidence[0].observed_at,
    validity_until: externalEvidence[0].validity_until,
  }],
};

const reviewArtifactText = JSON.stringify(reviewArtifact);
const reviewArtifactBytes = Buffer.byteLength(reviewArtifactText, "utf8");

if (reviewArtifactBytes > 20_000) {
  throw new Error(
    `Invinoveritas review artifact exceeds the partner limit: ${reviewArtifactBytes} bytes > 20000`,
  );
}

const reviewContext =
  "Neutral review of a fail-closed admission plan. The exact signed gro-1.1 record is supplied as external evidence, but issuer-provided verification, source-count, readiness, confidence, and historical freshness claims are not trust roots. The receiver must independently verify exact bytes, canonical payload hash, Ed25519 signature, receiver-controlled key trust, source provenance policy, and fresh receiver-controlled trusted UTC time strictly before expires_at at admission, then repeat the expiry check immediately before any irreversible action. This review never authorizes execution.";
const reviewContextBytes = Buffer.byteLength(reviewContext, "utf8");
if (reviewContextBytes > 4_000) {
  throw new Error(
    `Invinoveritas review context exceeds the partner contract: ${reviewContextBytes} bytes > 4000`,
  );
}

const reviewRequest = {
  artifact: reviewArtifactText,
  artifact_type: "plan",
  context: reviewContext,
  sign: true,
  confidentiality_tier: "partial_disclosure",
  disclosed_summary:
    "Geomacro supplies one exact signed gro-1.1 Risk Object as read-only external context. " +
    JSON.stringify({
      object_id: riskObject.object_id,
      subject: riskObject.subject,
      observed_at: riskObject.observed_at,
      expires_at: riskObject.expires_at,
      record_sha256: signedRiskObjectRecordSha256,
      decision_readiness: riskObject.decision_readiness ?? null,
    }) +
    " Receiver-side independent verification is mandatory; issuer attestations are not trust roots. No raw third-party source feed content is included.",
  external_evidence: externalEvidence,
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
      auth_mode: "primary" | "demo_fallback";
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
  let reviewApiKey = invinoApiKey;
  let reviewAuthMode: "primary" | "demo_fallback" = "primary";

  // /review/external can return a verdict without the portable proof. Federico acceptance requires the signed proof contract, so use canonical /review with sign=true.
  let response = await fetch(invinoOrigin + "/review", {
    method: "POST",
    headers: {
      authorization: "Bearer " + reviewApiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(reviewRequest),
  });

  let body = await response.json().catch(() => null);

  if (
    response.status === 402 &&
    invinoDemoApiKey &&
    invinoDemoApiKey !== invinoApiKey
  ) {
    reviewApiKey = invinoDemoApiKey;
    reviewAuthMode = "demo_fallback";
    response = await fetch(invinoOrigin + "/review", {
      method: "POST",
      headers: {
        authorization: "Bearer " + reviewApiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(reviewRequest),
    });
    body = await response.json().catch(() => null);
  }

  if (!response.ok) {
    throw new Error(
      "invinoveritas /review failed HTTP " + response.status + ": " + JSON.stringify(body),
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

  console.error(
    JSON.stringify({
      partner_review_issues: issues.map((issue: any) => ({
        severity: String(issue?.severity ?? "").toLowerCase(),
        code: issue?.code ?? issue?.type ?? null,
        title: issue?.title ?? null,
        summary: issue?.summary ?? null,
        message: issue?.message ?? null,
        reason: issue?.reason ?? null,
        field: issue?.field ?? issue?.path ?? null,
        details: issue?.details ?? null,
        provider_issue: issue,
      })),
    }),
  );

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

  // The partner's signed review verdict is advisory. "approve_with_concerns"
  // is still an admission decision when there are no blocker-severity issues.
  // High/medium/low concerns remain preserved in the proof and summary for
  // downstream human review; they do not convert an explicitly approving
  // partner verdict into a hard cryptographic admission failure.
  const admissionClear =
    ["approve", "approve_with_concerns"].includes(verdict) &&
    blockerCount === 0;

  liveReview = {
    attempted: true,
    auth_mode: reviewAuthMode,
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
        observed_at: observedAt,
        as_of: observedAt,
        expires_at: riskObject.expires_at,
        signing_key_id: riskObject?.integrity?.signing_key_id,
        integrity: {
          input_hash: riskObject?.integrity?.input_hash ?? null,
          data_hash: riskObject?.integrity?.data_hash ?? null,
          calculation_hash: riskObject?.integrity?.calculation_hash ?? null,
          payload_hash: riskObject?.integrity?.payload_hash ?? null,
          signature_scheme: riskObject?.integrity?.signature_scheme ?? null,
          canonicalization: riskObject?.integrity?.canonicalization ?? null,
          signature: riskObject?.integrity?.signature ?? null,
        },
      },
      geomacro_verification: original.body.verification,
      tamper_verification:
        tamperResult.body?.verification ?? tamperResult.body,
      invinoveritas_request: {
        artifact_type: reviewRequest.artifact_type,
        sign: reviewRequest.sign,
        confidentiality_tier: reviewRequest.confidentiality_tier,
        context: reviewRequest.context,
        context_bytes: reviewContextBytes,
        artifact_bytes: reviewArtifactBytes,
        external_evidence: [{
          source: externalEvidence[0].source,
          evidence_type: externalEvidence[0].evidence_type,
          record_sha256: externalEvidence[0].record_sha256,
          record_bytes: Buffer.byteLength(externalEvidence[0].record, "utf8"),
          observed_at: externalEvidence[0].observed_at,
          validity_until: externalEvidence[0].validity_until,
        }],
        review_auth_mode: liveReview.attempted ? liveReview.auth_mode : null,
        request_written_to: requestOut || null,
        review_response_written_to: reviewOut || null,
      },
      receiver_controlled_trust_anchor: receiverControlledTrustAnchor,
      live_review: liveReview,
      handoff_rule:
        "Immediately before partner testing, publish/retrieve a fresh production-signed GRO and rerun this preflight. Never extend expires_at or edit a signed artifact.",
    },
    null,
    2,
  ),
);
