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
      "Limited Design Partner pilot access under Geomacro's free-quota operating envelope.",
    upgrade: {
      available: true,
      contact:
        GEOMACRO_COMMERCIAL_CONTACT,
      message:
        "For higher limits, broader access, production use, or full commercial access, contact Geomacro for paid options.",
    },
  };
}

export function paidX402CommercialAccess():
  RiskGateCommercialAccess {
  return {
    schema_version:
      RISK_GATE_COMMERCIAL_ACCESS_VERSION,
    tier:
      "paid_x402",
    quota_class:
      "commercial",
    production_entitlement:
      true,
    notice:
      "Commercial access is governed by the active Geomacro x402 product and customer terms.",
    upgrade: {
      available: true,
      contact:
        GEOMACRO_COMMERCIAL_CONTACT,
      message:
        "Contact Geomacro for higher limits, broader coverage, or commercial support options.",
    },
  };
}
