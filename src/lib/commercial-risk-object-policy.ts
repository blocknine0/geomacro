import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  verifyPublicRiskObjectArtifact,
  type PublicRiskObjectVerificationReport,
} from "./risk-object-verification.server";

export const COMMERCIAL_RISK_OBJECT_POLICY_VERSION =
  "commercial-gro-policy-v1.0.0" as const;

export type CommercialRiskObjectDeliverabilityReport = {
  policy_version: typeof COMMERCIAL_RISK_OBJECT_POLICY_VERSION;
  deliverable: boolean;
  cryptographic_valid: boolean;
  public_artifact_valid: boolean;
  commercial_eligibility_status: GeomacroRiskObject["commercial_eligibility"]["status"];
  embedded_verification_status: GeomacroRiskObject["verification"]["status"];
  reason_codes: string[];
  public_verification: PublicRiskObjectVerificationReport;
};

function normalizedReasonCodes(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

/**
 * Commercial delivery policy for signed Geomacro Risk Objects.
 *
 * Public verification answers whether an artifact is authentic/current. Paid
 * delivery has a stricter boundary: the signed artifact must also carry a
 * VERIFIED commercial-eligibility decision and a VERIFIED embedded
 * verification state. This prevents an authentic but commercially ineligible,
 * incomplete, legacy, or stale object from being sold by any machine surface.
 */
export function verifyCommercialRiskObjectArtifact(
  object: GeomacroRiskObject,
  options?: Parameters<typeof verifyPublicRiskObjectArtifact>[1],
): CommercialRiskObjectDeliverabilityReport {
  const publicVerification = verifyPublicRiskObjectArtifact(object, options);
  const commercialVerified = object.commercial_eligibility.status === "VERIFIED";
  const embeddedVerified = object.verification.status === "VERIFIED";

  const reasonCodes = [...publicVerification.reason_codes];
  if (!commercialVerified) {
    reasonCodes.push("commercial_eligibility_not_verified");
  }
  if (!embeddedVerified) {
    reasonCodes.push("embedded_verification_not_verified");
  }

  const deliverable =
    publicVerification.valid &&
    publicVerification.cryptographic_valid &&
    commercialVerified &&
    embeddedVerified;

  return {
    policy_version: COMMERCIAL_RISK_OBJECT_POLICY_VERSION,
    deliverable,
    cryptographic_valid: publicVerification.cryptographic_valid,
    public_artifact_valid: publicVerification.valid,
    commercial_eligibility_status: object.commercial_eligibility.status,
    embedded_verification_status: object.verification.status,
    reason_codes: normalizedReasonCodes(reasonCodes),
    public_verification: publicVerification,
  };
}

export function assertCommercialRiskObjectDeliverable(
  object: GeomacroRiskObject,
  options?: Parameters<typeof verifyPublicRiskObjectArtifact>[1],
): CommercialRiskObjectDeliverabilityReport {
  const report = verifyCommercialRiskObjectArtifact(object, options);
  if (!report.deliverable) {
    const error = new Error("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
    Object.assign(error, { commercialRiskObjectReport: report });
    throw error;
  }
  return report;
}
