export const PUBLIC_DEMO_RISK_PROFILE_REASON =
  "public_demo_commercial_subset" as const;

export const PUBLIC_DEMO_CALCULATION_NAMESPACE =
  "public_demo_commercial_subset_v1" as const;

export const FEDERICO_STRICT_RISK_PROFILE_REASON =
  "federico_strict_evidence_policy_v1" as const;

export const FEDERICO_STRICT_CALCULATION_NAMESPACE =
  "federico_strict_evidence_v1" as const;

export const FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS = 6;
export const FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS = 3;
export const FEDERICO_STRICT_HIGH_IMPACT_SEVERITY = 70;
export const FEDERICO_STRICT_SOURCE_INDEPENDENCE_METHOD =
  "controlled_live_flash_source_family_v1" as const;
export const FEDERICO_STRICT_RELEVANCE_METHOD =
  "direct_country_mapping_v1" as const;
export const FEDERICO_STRICT_MAJOR_SOURCE_IDS = [
  "aljazeera_rss",
] as const;

export type RiskObjectDeliveryProfile =
  | "CANONICAL"
  | "PUBLIC_DEMO"
  | "FEDERICO_STRICT";

export function riskObjectCalculationNamespace(
  profile: RiskObjectDeliveryProfile,
) {
  if (profile === "PUBLIC_DEMO") {
    return PUBLIC_DEMO_CALCULATION_NAMESPACE;
  }

  if (profile === "FEDERICO_STRICT") {
    return FEDERICO_STRICT_CALCULATION_NAMESPACE;
  }

  return undefined;
}

export function withPublicDemoProfileReason(
  reasonCodes: string[],
) {
  return [
    ...new Set([
      ...reasonCodes,
      PUBLIC_DEMO_RISK_PROFILE_REASON,
    ]),
  ].sort();
}
