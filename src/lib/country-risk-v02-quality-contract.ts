export const COUNTRY_RISK_V02_QUALITY_CONTRACT_VERSION =
  "country-risk-quality-contract-v0.1.0-pilot" as const;


export type ComponentQualityStatus =
  | "STRONG"
  | "USABLE"
  | "LIMITED"
  | "INSUFFICIENT";


export type ComponentQualitySemantics = {
  confidence:
    number | null;

  reliability:
    number;

  reliability_status:
    ComponentQualityStatus;

  confidence_semantics:
    "MEASUREMENT_CERTAINTY";

  reliability_semantics:
    "EVIDENCE_QUALITY";

  weighting_semantics:
    "BASE_WEIGHT_TIMES_RELIABILITY_NORMALIZED";

  warnings:
    string[];
};


export function validateQualityFactor(
  name:
    string,

  value:
    number | null,
) {
  if (
    value ===
    null
  ) {
    return;
  }


  if (
    !Number.isFinite(
      value,
    ) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `${name} must be within [0,1]`,
    );
  }
}


export function validateComponentQualitySemantics(
  quality:
    ComponentQualitySemantics,
) {
  validateQualityFactor(
    "confidence",
    quality.confidence,
  );

  validateQualityFactor(
    "reliability",
    quality.reliability,
  );


  if (
    quality.confidence_semantics !==
    "MEASUREMENT_CERTAINTY"
  ) {
    throw new Error(
      "Invalid confidence semantics",
    );
  }


  if (
    quality.reliability_semantics !==
    "EVIDENCE_QUALITY"
  ) {
    throw new Error(
      "Invalid reliability semantics",
    );
  }


  if (
    quality.weighting_semantics !==
    "BASE_WEIGHT_TIMES_RELIABILITY_NORMALIZED"
  ) {
    throw new Error(
      "Invalid weighting semantics",
    );
  }


  return true;
}
