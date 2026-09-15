import {
  COMMERCIAL_SOURCE_RIGHTS_EVIDENCE,
} from "./commercial-source-rights-evidence.mjs";

export const COMMERCIAL_SOURCE_POLICY = Object.freeze(
  Object.fromEntries(
    Object.entries(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE).map(
      ([sourceId, evidence]) => [
        sourceId,
        Object.freeze({
          allowed_statuses: Object.freeze([evidence.approved_status]),
          reviewed_on: evidence.reviewed_on,
        }),
      ],
    ),
  ),
);

export function assertCommercialEligibilityAllowed(
  sourceId,
  requestedStatus,
) {
  const source = String(sourceId ?? "").trim();
  const status = String(requestedStatus ?? "UNVERIFIED")
    .trim()
    .toUpperCase();

  // UNVERIFIED is always allowed because it is the shared fail-closed default.
  if (status === "UNVERIFIED") {
    return "UNVERIFIED";
  }

  const policy = COMMERCIAL_SOURCE_POLICY[source];
  const allowed = policy?.allowed_statuses ?? [];

  if (!allowed.includes(status)) {
    throw new Error(
      `Commercial eligibility ${status} is not approved for source ${source || "<missing>"}`,
    );
  }

  return status;
}
