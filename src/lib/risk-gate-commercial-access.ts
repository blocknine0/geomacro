export const RISK_GATE_COMMERCIAL_ACCESS_VERSION =
  "risk-gate-commercial-access-v1" as const;

export type RiskGateCommercialAccessTier =
  | "design_partner_pilot"
  | "private_pilot"
  | "paid_x402";

export type RiskGateCommercialQuotaClass =
  | "limited_free_quota"
  | "commercial";

export type RiskGateCommercialAccess = {
  schema_version:
    typeof RISK_GATE_COMMERCIAL_ACCESS_VERSION;

  tier:
    RiskGateCommercialAccessTier;

  quota_class:
    RiskGateCommercialQuotaClass;

  production_entitlement:
    boolean;

  notice:
    string;

  upgrade: {
    available: boolean;
    contact: string;
    message: string;
  };
};

export const GEOMACRO_COMMERCIAL_CONTACT =
  "contact@geomacro.live" as const;

export function designPartnerPilotCommercialAccess():
  RiskGateCommercialAccess {
  return {
    schema_version:
      RISK_GATE_COMMERCIAL_ACCESS_VERSION,
    tier:
      "design_partner_pilot",
    quota_class:
      "limited_free_quota",
    production_entitlement:
      false,
    notice:
      "Three-day live testing only: non-production, zero-charge access under Geomacro's free-quota operating envelope. Commercial use requires explicit go-live authorization.",
    upgrade: {
      available: true,
      contact:
        GEOMACRO_COMMERCIAL_CONTACT,
      message:
        "For higher limits, broader access, production use, or full commercial access, contact Geomacro for paid options.",
    },
  };
}

export function privatePilotCommercialAccess(): RiskGateCommercialAccess {
  return {
    schema_version: RISK_GATE_COMMERCIAL_ACCESS_VERSION,
    tier: "private_pilot",
    quota_class: "limited_free_quota",
    production_entitlement: false,
    notice: "Three-day live testing only: private, non-production, zero-charge access. Commercial use requires explicit go-live authorization.",
    upgrade: {
      available: true,
      contact: GEOMACRO_COMMERCIAL_CONTACT,
      message: "Commercial access is unavailable until live testing completes and Geomacro explicitly authorizes commercial go-live.",
    },
  };
}

export function paidX402CommercialAccess(paymentVerified = false):
  RiskGateCommercialAccess {
  return {
    schema_version:
      RISK_GATE_COMMERCIAL_ACCESS_VERSION,
    tier:
      "paid_x402",
    quota_class:
      paymentVerified ? "commercial" : "limited_free_quota",
    production_entitlement:
      paymentVerified,
    notice:
      paymentVerified
        ? "Verified x402 payment grants the purchased commercial entitlement under the active Geomacro product and customer terms."
        : "Production entitlement is withheld until x402 payment verification and settlement succeed.",
    upgrade: {
      available: true,
      contact:
        GEOMACRO_COMMERCIAL_CONTACT,
      message:
        "Contact Geomacro for higher limits, broader coverage, or commercial support options.",
    },
  };
}
