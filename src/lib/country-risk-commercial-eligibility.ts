import type {
  GeomacroRiskObject,
} from "./risk-object-contract";


export type StructuredEventCommercialEligibilityStatus =
  | "VERIFIED"
  | "DERIVED_ONLY"
  | "UNVERIFIED"
  | "INELIGIBLE";


export type StructuredEventCommercialEligibility = {
  event_id: string;
  status:
    StructuredEventCommercialEligibilityStatus;
  reason_codes: string[];
};


function normalizeReasons(
  values: string[],
) {
  return [
    ...new Set(
      values
        .map(String)
        .map(
          value =>
            value.trim(),
        )
        .filter(Boolean),
    ),
  ].sort();
}


/**
 * Resolve commercial eligibility only from events that actually appear in the
 * calculated GRO evidence set. Missing metadata fails closed.
 *
 * This function does not change the score or calculation hash. Commercial
 * eligibility is signed as part of the final GRO payload before publication.
 */
export function applyCountryRiskCommercialEligibility(
  object: GeomacroRiskObject,
  eligibility:
    StructuredEventCommercialEligibility[],
): GeomacroRiskObject {
  const byEventId =
    new Map(
      eligibility.map(
        item => [
          item.event_id,
          item,
        ],
      ),
    );

  const used =
    object.evidence.map(
      evidence =>
        byEventId.get(
          evidence.event_id,
        ) ?? {
          event_id:
            evidence.event_id,
          status:
            "UNVERIFIED" as const,
          reason_codes: [
            "missing_structured_event_commercial_eligibility",
          ],
        },
    );

  const commercialReasons =
    new Set<string>();

  let status:
    GeomacroRiskObject[
      "commercial_eligibility"
    ]["status"] =
      "UNVERIFIED";

  if (used.length === 0) {
    commercialReasons.add(
      "insufficient_country_evidence",
    );
  } else if (
    used.some(
      item =>
        item.status ===
          "INELIGIBLE",
    )
  ) {
    status = "INELIGIBLE";
    commercialReasons.add(
      "commercial_source_ineligible",
    );
  } else if (
    used.every(
      item =>
        item.status ===
          "VERIFIED",
    )
  ) {
    status = "VERIFIED";
  } else {
    for (const item of used) {
      if (
        item.status ===
          "DERIVED_ONLY"
      ) {
        commercialReasons.add(
          "commercial_source_derived_only",
        );
      }

      if (
        item.status ===
          "UNVERIFIED"
      ) {
        commercialReasons.add(
          "commercial_source_unverified",
        );
      }

      for (
        const reason of
          item.reason_codes
      ) {
        commercialReasons.add(
          reason,
        );
      }
    }
  }

  const verificationReasons =
    new Set(
      object.verification
        .reason_codes,
    );

  verificationReasons.delete(
    "commercial_source_eligibility_not_enforced",
  );

  if (status !== "VERIFIED") {
    for (
      const reason of
        commercialReasons
    ) {
      verificationReasons.add(
        reason,
      );
    }
  }

  const reasonCodes =
    normalizeReasons(
      [...verificationReasons],
    );

  const verificationStatus =
    status === "VERIFIED" &&
    reasonCodes.length === 0
      ? "VERIFIED" as const
      : object.verification
          .status ===
          "UNVERIFIABLE" ||
        object.verification
          .status ===
          "EXPIRED" ||
        object.verification
          .status ===
          "STALE"
      ? object.verification.status
      : "INCOMPLETE" as const;

  return {
    ...object,

    commercial_eligibility: {
      status,
      reason_codes:
        normalizeReasons(
          [...commercialReasons],
        ),
    },

    verification: {
      ...object.verification,
      status:
        verificationStatus,
      reason_codes:
        reasonCodes,
      last_verified_at:
        verificationStatus ===
          "VERIFIED"
          ? object.generated_at
          : object.verification
              .last_verified_at,
    },
  };
}
