import {
  getRiskSupabase,
} from "./risk-supabase.server";

import {
  publicRiskObjectVerificationKeySet,
} from "./risk-object-signing.server";

import {
  validateRiskObjectSigningReadiness,
} from "./risk-object-signing-readiness.server";

export type RiskGateReadiness = {
  status:
    | "ready"
    | "not_ready";

  checked_at: string;

  checks: {
    database: boolean;
    audit_store: boolean;
    verification_keys: boolean;
    fresh_country_risk_object: boolean;
    publisher_signing: boolean;
    source_network_100_complete: boolean;
    realtime_source_freshness: boolean;
  };
};

/**
 * Coarse operational readiness only.
 *
 * Do not return database errors, environment values, key material, object IDs
 * or customer information from this function's public result.
 */
export async function evaluateRiskGateReadiness(
  now = new Date(),
): Promise<RiskGateReadiness> {
  if (
    !Number.isFinite(
      now.getTime(),
    )
  ) {
    throw new Error(
      "Invalid readiness clock",
    );
  }

  const checkedAt =
    now.toISOString();

  let verificationKeys =
    false;

  try {
    const keySet =
      publicRiskObjectVerificationKeySet();

    verificationKeys =
      keySet.keys.some(
        key =>
          key.status !==
          "revoked",
      );
  } catch {
    verificationKeys =
      false;
  }

  let publisherSigning =
    false;

  try {
    validateRiskObjectSigningReadiness(
      now,
    );

    publisherSigning =
      true;
  } catch {
    publisherSigning =
      false;
  }

  const db =
    getRiskSupabase();

  let database = false;
  let auditStore = false;
  let freshCountryRiskObject =
    false;
  let sourceNetwork100Complete =
    false;
  let realtimeSourceFreshness =
    false;

  if (db) {
    try {
      const probe =
        await db
          .from(
            "geomacro_risk_objects",
          )
          .select(
            "object_id",
          )
          .limit(1);

      database =
        !probe.error;
    } catch {
      database =
        false;
    }

    if (database) {
      try {
        const sourceNetworkProbe =
          await db
            .from(
              "live_source_network_launch_status",
            )
            .select(
              "source_network_100_complete,gdelt_gal_freshness_complete,source_network_launch_complete",
            )
            .maybeSingle();

        sourceNetwork100Complete =
          !sourceNetworkProbe.error &&
          sourceNetworkProbe.data?.source_network_100_complete === true;

        realtimeSourceFreshness =
          !sourceNetworkProbe.error &&
          sourceNetworkProbe.data?.gdelt_gal_freshness_complete === true;
      } catch {
        sourceNetwork100Complete = false;
        realtimeSourceFreshness = false;
      }

      try {
        const auditProbe =
          await db
            .from(
              "risk_gate_audit_log",
            )
            .select(
              "audit_id",
            )
            .limit(1);

        auditStore =
          !auditProbe.error;
      } catch {
        auditStore =
          false;
      }

      try {
        const freshProbe =
          await db
            .from(
              "geomacro_risk_objects",
            )
            .select(
              "object_id",
            )
            .eq(
              "subject_type",
              "country",
            )
            .gt(
              "expires_at",
              checkedAt,
            )
            .order(
              "generated_at",
              {
                ascending: false,
              },
            )
            .limit(1);

        freshCountryRiskObject =
          !freshProbe.error &&
          Array.isArray(
            freshProbe.data,
          ) &&
          freshProbe.data.length > 0;
      } catch {
        freshCountryRiskObject =
          false;
      }
    }
  }

  const checks = {
    database,
    audit_store:
      auditStore,
    verification_keys:
      verificationKeys,
    fresh_country_risk_object:
      freshCountryRiskObject,
    publisher_signing:
      publisherSigning,
    source_network_100_complete:
      sourceNetwork100Complete,
    realtime_source_freshness:
      realtimeSourceFreshness,
  };

  const ready =
    Object.values(checks)
      .every(Boolean);

  return {
    status:
      ready
        ? "ready"
        : "not_ready",
    checked_at:
      checkedAt,
    checks,
  };
}
