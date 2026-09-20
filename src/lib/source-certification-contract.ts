export const SOURCE_CERTIFICATION_ENDPOINT_STATUSES = [
  "UNTESTED",
  "PASS",
  "CANONICAL_REQUIRED",
  "AUTH_REQUIRED",
  "WAF",
  "DEPRECATED",
  "WRONG_ENDPOINT",
  "TIMEOUT",
  "DNS_FAILURE",
  "BLOCKED_ENVIRONMENT",
  "FAIL",
] as const;

export type SourceCertificationEndpointStatus =
  (typeof SOURCE_CERTIFICATION_ENDPOINT_STATUSES)[number];

export const SOURCE_CERTIFICATION_RIGHTS_READY_STATUSES = [
  "COMMERCIAL_OK",
  "DERIVED_ONLY",
] as const;

export type SourceCertificationRightsStatus =
  | "UNREVIEWED"
  | "COMMERCIAL_OK"
  | "DERIVED_ONLY"
  | "PERMISSION_REQUIRED"
  | "INTERNAL_RESEARCH_ONLY"
  | "REVIEW_REQUIRED"
  | "NOT_APPLICABLE";

export type SourceCertificationState =
  | "NOT_STARTED"
  | "IN_REVIEW"
  | "CERTIFIED"
  | "REJECTED";

export function endpointDispositionComplete(
  status: SourceCertificationEndpointStatus,
): boolean {
  return status !== "UNTESTED";
}

export function endpointUsableForCertification(
  status: SourceCertificationEndpointStatus,
): boolean {
  return status === "PASS";
}

export function rightsUsableForDerivedCommercialDelivery(
  status: SourceCertificationRightsStatus,
): boolean {
  return (
    status === "COMMERCIAL_OK" ||
    status === "DERIVED_ONLY"
  );
}

export function certificationEvidenceComplete(input: {
  certification_state: SourceCertificationState;
  endpoint_status: SourceCertificationEndpointStatus;
  rights_status: SourceCertificationRightsStatus;
  schema_status: "UNTESTED" | "PASS" | "PARTIAL" | "FAIL" | "NOT_APPLICABLE";
  freshness_status:
    | "UNTESTED"
    | "FRESH"
    | "AGING"
    | "STALE"
    | "VARIABLE"
    | "FAIL"
    | "NOT_APPLICABLE";
  provenance_status: "UNTESTED" | "PASS" | "PARTIAL" | "FAIL" | "NOT_APPLICABLE";
  independence_status: "UNTESTED" | "PASS" | "PARTIAL" | "FAIL" | "NOT_APPLICABLE";
  adapter_status: "UNMAPPED" | "MAPPED" | "TESTED" | "FAIL" | "NOT_APPLICABLE";
  runtime_status: "UNTESTED" | "PASS" | "DEGRADED" | "FAIL" | "NOT_APPLICABLE";
  fallback_status: "UNTESTED" | "READY" | "NOT_REQUIRED" | "FAIL";
  certified_at?: string | null;
  certification_hash?: string | null;
}): boolean {
  return (
    input.certification_state === "CERTIFIED" &&
    input.endpoint_status === "PASS" &&
    rightsUsableForDerivedCommercialDelivery(input.rights_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(input.schema_status) &&
    ["FRESH", "VARIABLE", "NOT_APPLICABLE"].includes(input.freshness_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(input.provenance_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(input.independence_status) &&
    ["TESTED", "NOT_APPLICABLE"].includes(input.adapter_status) &&
    ["PASS", "NOT_APPLICABLE"].includes(input.runtime_status) &&
    ["READY", "NOT_REQUIRED"].includes(input.fallback_status) &&
    Boolean(input.certified_at) &&
    Boolean(input.certification_hash)
  );
}
