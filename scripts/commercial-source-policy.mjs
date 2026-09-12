export const COMMERCIAL_SOURCE_POLICY = Object.freeze({
  world_bank_indicators: Object.freeze({
    allowed_statuses: Object.freeze(["VERIFIED"]),
    reviewed_on: "2026-09-10",
  }),
  world_bank_wgi_political_stability: Object.freeze({
    allowed_statuses: Object.freeze(["VERIFIED"]),
    reviewed_on: "2026-09-10",
  }),
  unhcr_refugee_statistics: Object.freeze({
    allowed_statuses: Object.freeze(["VERIFIED"]),
    reviewed_on: "2026-09-10",
  }),
  ucdp_ged: Object.freeze({
    allowed_statuses: Object.freeze(["VERIFIED"]),
    reviewed_on: "2026-09-10",
  }),
  ucdp_candidate: Object.freeze({
    allowed_statuses: Object.freeze(["VERIFIED"]),
    reviewed_on: "2026-09-12",
  }),
  usgs_mcs: Object.freeze({
    allowed_statuses: Object.freeze(["VERIFIED"]),
    reviewed_on: "2026-09-10",
  }),
  reliefweb: Object.freeze({
    allowed_statuses: Object.freeze(["DERIVED_ONLY"]),
    reviewed_on: "2026-09-10",
  }),
});

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
