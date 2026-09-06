import type {
  ComponentQualitySemantics,
} from "./country-risk-v02-quality-contract";

import {
  validateComponentQualitySemantics,
} from "./country-risk-v02-quality-contract";


export type BuildComponentQualityViewInput = {
  confidence:
    number | null;

  reliability:
    number;

  reliability_status:
    ComponentQualitySemantics[
      "reliability_status"
    ];

  warnings:
    string[];
};


export function buildComponentQualityView(
  input:
    BuildComponentQualityViewInput,
): ComponentQualitySemantics {
  const result:
    ComponentQualitySemantics = {
      confidence:
        input.confidence,

      reliability:
        input.reliability,

      reliability_status:
        input.reliability_status,

      confidence_semantics:
        "MEASUREMENT_CERTAINTY",

      reliability_semantics:
        "EVIDENCE_QUALITY",

      weighting_semantics:
        "BASE_WEIGHT_TIMES_RELIABILITY_NORMALIZED",

      warnings:
        [
          ...input.warnings,
        ].sort(),
    };


  validateComponentQualitySemantics(
    result,
  );


  return result;
}
