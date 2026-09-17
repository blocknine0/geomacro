export const PUBLIC_DEMO_RISK_PROFILE_REASON =
  "public_demo_commercial_subset" as const;

export const PUBLIC_DEMO_CALCULATION_NAMESPACE =
  "public_demo_commercial_subset_v1" as const;

export type RiskObjectDeliveryProfile =
  | "CANONICAL"
  | "PUBLIC_DEMO";

export function riskObjectCalculationNamespace(
  profile: RiskObjectDeliveryProfile,
) {
  return profile === "PUBLIC_DEMO"
    ? PUBLIC_DEMO_CALCULATION_NAMESPACE
    : undefined;
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
