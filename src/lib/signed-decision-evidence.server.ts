import { createHash } from "node:crypto";
import type { GeomacroRiskObject } from "./risk-object-contract";
import type { RiskObjectVerificationKeys } from "./risk-object-signing.server";
import { assertCommercialRiskObjectDeliverable } from "./commercial-risk-object-policy";

export const SIGNED_DECISION_EVIDENCE_VERSION =
  "geomacro.signed-decision-evidence.v1" as const;

export type PolicyAdvisory = Readonly<{
  policy_version: string;
  evaluated_at: string;
  disposition: "ALLOW" | "CAUTION" | "REVIEW" | "BLOCK" | "INSUFFICIENT_EVIDENCE";
  reason_codes: readonly string[];
}>;

/** Independently authenticates the GRO using the existing trusted verifier.
 * The advisory is explicitly NOT included in the GRO signature. Hashing the
 * advisory does not sign it and never authorizes payment/execution.
 */
export function buildSignedDecisionEvidence(
  object: GeomacroRiskObject,
  options: {
    now: Date;
    verification_keys?: RiskObjectVerificationKeys;
    advisory?: PolicyAdvisory | null;
  },
) {
  const report = assertCommercialRiskObjectDeliverable(object, {
    now: options.now, verification_keys: options.verification_keys,
  });
  const integrity = object.integrity;
  if (!report.cryptographic_valid || !report.public_artifact_valid ||
      integrity.signature_scheme !== "Ed25519" ||
      !integrity.signature || !integrity.payload_hash || !integrity.signing_key_id)
    throw Error("SIGNED_DECISION_GRO_PROOF_NOT_VERIFIABLE");
  const observed = object.observed_at ?? null;
  const signingTime = Date.parse(object.generated_at);
  const expiry = Date.parse(object.expires_at);
  if (!Number.isFinite(signingTime) || !Number.isFinite(expiry) ||
      expiry <= options.now.getTime() || (observed !== null && (!Number.isFinite(Date.parse(observed)) ||
        Date.parse(observed) > signingTime)))
    throw Error("SIGNED_DECISION_PROOF_EXPIRED_OR_CLOCK_INVALID");

  const advisory = options.advisory ?? null;
  if (advisory) {
    const at = Date.parse(advisory.evaluated_at);
    if (!advisory.policy_version?.trim() || !Number.isFinite(at) ||
        at > options.now.getTime() || at < signingTime || at >= expiry ||
        !["ALLOW", "CAUTION", "REVIEW", "BLOCK", "INSUFFICIENT_EVIDENCE"].includes(advisory.disposition) ||
        !Array.isArray(advisory.reason_codes) ||
        advisory.reason_codes.some(reason => typeof reason !== "string" || !reason.trim()))
      throw Error("SIGNED_DECISION_ADVISORY_INVALID");
    if (object.decision_readiness?.policy_version &&
        object.decision_readiness.policy_version !== advisory.policy_version)
      throw Error("SIGNED_DECISION_POLICY_VERSION_MISMATCH");
  }
  const policyOutput = advisory ? {
    policy_version: advisory.policy_version,
    evaluated_at: advisory.evaluated_at,
    disposition: advisory.disposition,
    reason_codes: [...new Set(advisory.reason_codes)].sort(),
  } : null;
  const policyFingerprint = policyOutput
    ? createHash("sha256").update(JSON.stringify(policyOutput)).digest("hex") : null;

  return {
    schema_version: SIGNED_DECISION_EVIDENCE_VERSION,
    issuer: "Geomacro" as const,
    subject: { ...object.subject },
    signed_risk_object: {
      object_id: object.object_id,
      payload_hash: integrity.payload_hash,
      signature: integrity.signature,
      signing_key_id: integrity.signing_key_id,
      signature_scheme: integrity.signature_scheme,
      calculation_hash: integrity.calculation_hash,
      input_hash: integrity.input_hash,
      generated_at: object.generated_at,
      observed_at: observed,
      expires_at: object.expires_at,
      methodology_version: object.methodology_version,
      risk: { ...object.risk },
      risk_drivers: object.attribution.map(x => ({
        driver: x.driver, score_contribution: x.score_contribution,
        delta_contribution: x.delta_contribution,
      })),
      cryptographically_verified: true as const,
    },
    policy_advisory: policyOutput && {
      ...policyOutput,
      advisory_hash: policyFingerprint,
      covered_by_risk_object_signature: false as const,
      independently_signed: false as const,
    },
    signature_scope: "EXISTING_GRO_ONLY_ADVISORY_NOT_CRYPTOGRAPHICALLY_SIGNED" as const,
    advisory_not_execution: true as const,
    execution_authorized: false as const,
  };
}
