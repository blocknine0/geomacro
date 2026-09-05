export const COUNTRY_RISK_V02_WEIGHTING_VERSION =
  "country-risk-weighting-v0.2.0-pilot" as const;


export const COUNTRY_RISK_V02_WEIGHTS = {
  event_risk:
    0.60,

  macro:
    0.20,

  geopolitics:
    0.20,

  critical_minerals:
    0,
} as const;


export function validateCountryRiskV02Weights() {
  const total =
    COUNTRY_RISK_V02_WEIGHTS
      .event_risk +
    COUNTRY_RISK_V02_WEIGHTS
      .macro +
    COUNTRY_RISK_V02_WEIGHTS
      .geopolitics +
    COUNTRY_RISK_V02_WEIGHTS
      .critical_minerals;


  if (
    Math.abs(
      total - 1,
    ) > 1e-12
  ) {
    throw new Error(
      `Invalid GRO v0.2 weight total: ${total}`,
    );
  }


  return true;
}
