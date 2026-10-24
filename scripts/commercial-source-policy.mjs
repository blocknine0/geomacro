import {
  COMMERCIAL_SOURCE_RIGHTS_EVIDENCE,
} from "./commercial-source-rights-evidence.mjs";

export const TELEGRAM_OWNER_DECLARED_DERIVED_RIGHTS_STATE = "OWNER_DECLARED_TELEGRAM_DERIVED_ONLY";
export const TELEGRAM_EXPORT_PROVENANCE = "TELEGRAM_PUBLIC_EXPORT";
/** Owner's scoped declaration is NOT a verified licence or permission to scrape. */
export const TELEGRAM_EXPORT_RIGHTS_POLICY = Object.freeze({
  state: TELEGRAM_OWNER_DECLARED_DERIVED_RIGHTS_STATE,
  provenance: TELEGRAM_EXPORT_PROVENANCE,
  allowed_delivery: "OWNER_SUPPLIED_FILE_DERIVED_STRUCTURED_ONLY",
  verified: false, telegram_platform_clearance_verified: false,
  upstream_licence_verified: false, raw_redistribution_allowed: false,
  paid_enabled_by_default: false,
});

export function assertOwnerDeclaredTelegramExportRights(input) {
  if(input?.provenance !== TELEGRAM_EXPORT_PROVENANCE ||
     input?.rights_state !== TELEGRAM_OWNER_DECLARED_DERIVED_RIGHTS_STATE ||
     input?.verification_status !== "UNVERIFIED_CLAIM" ||
     input?.scored !== false || input?.execution_authorized !== false)
    throw Error("TELEGRAM_EXPORT_OWNER_DECLARATION_INVALID");
  return TELEGRAM_EXPORT_RIGHTS_POLICY;
}

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
