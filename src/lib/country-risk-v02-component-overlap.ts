import type {
  RiskDriver,
} from "./risk-object-contract";


export type IntegratedComponent =
  | "EVENT"
  | "MACRO"
  | "GEOPOLITICS"
  | "CRITICAL_MINERALS";


export type ComponentOverlapStatus =
  | "ORTHOGONAL"
  | "PARTIAL_OVERLAP"
  | "DIRECT_OVERLAP"
  | "REVIEW_REQUIRED";


export type ComponentOverlapRule = {
  event_driver:
    RiskDriver;

  overlaps_with:
    IntegratedComponent[];

  status:
    ComponentOverlapStatus;

  rationale:
    string;
};


export const COMPONENT_OVERLAP_RULES:
  ComponentOverlapRule[] = [
  {
    event_driver:
      "inflation",

    overlaps_with:
      ["MACRO"],

    status:
      "DIRECT_OVERLAP",

    rationale:
      "Structured macro component directly includes inflation.",
  },

  {
    event_driver:
      "labor_market",

    overlaps_with:
      ["MACRO"],

    status:
      "DIRECT_OVERLAP",

    rationale:
      "Structured macro component directly includes unemployment.",
  },

  {
    event_driver:
      "macro_stress",

    overlaps_with:
      ["MACRO"],

    status:
      "DIRECT_OVERLAP",

    rationale:
      "Generic macro-stress event attribution overlaps with structured macro conditions.",
  },

  {
    event_driver:
      "monetary_policy",

    overlaps_with:
      ["MACRO"],

    status:
      "PARTIAL_OVERLAP",

    rationale:
      "Monetary-policy events influence macro risk but are not identical to the structured macro state.",
  },

  {
    event_driver:
      "conflict",

    overlaps_with:
      ["GEOPOLITICS"],

    status:
      "PARTIAL_OVERLAP",

    rationale:
      "Conflict events can drive displacement, but the structured geopolitics component measures population burden rather than event severity.",
  },

  {
    event_driver:
      "political_instability",

    overlaps_with:
      ["GEOPOLITICS"],

    status:
      "PARTIAL_OVERLAP",

    rationale:
      "Political instability may contribute to displacement but is not equivalent to observed displacement burden.",
  },

  {
    event_driver:
      "sanctions",

    overlaps_with:
      ["GEOPOLITICS"],

    status:
      "PARTIAL_OVERLAP",

    rationale:
      "Sanctions are geopolitical events but are not directly measured by the current displacement-based component.",
  },

  {
    event_driver:
      "rare_earth_supply",

    overlaps_with:
      ["CRITICAL_MINERALS"],

    status:
      "DIRECT_OVERLAP",

    rationale:
      "Future critical-minerals dependency scoring would directly overlap with rare-earth supply event attribution.",
  },

  {
    event_driver:
      "critical_minerals",

    overlaps_with:
      ["CRITICAL_MINERALS"],

    status:
      "DIRECT_OVERLAP",

    rationale:
      "Future critical-minerals structured component would directly overlap with this event driver.",
  },

  {
    event_driver:
      "trade_policy",

    overlaps_with:
      ["MACRO", "GEOPOLITICS"],

    status:
      "REVIEW_REQUIRED",

    rationale:
      "Trade-policy events can affect both macro conditions and geopolitical exposure.",
  },

  {
    event_driver:
      "currency_fx",

    overlaps_with:
      ["MACRO"],

    status:
      "PARTIAL_OVERLAP",

    rationale:
      "FX stress is macro-related but not directly represented by the current four structured macro dimensions.",
  },

  {
    event_driver:
      "shipping_logistics",

    overlaps_with:
      ["GEOPOLITICS"],

    status:
      "REVIEW_REQUIRED",

    rationale:
      "Shipping disruption can be geopolitical but is not represented directly by displacement metrics.",
  },

  {
    event_driver:
      "other",

    overlaps_with:
      [],

    status:
      "REVIEW_REQUIRED",

    rationale:
      "Unclassified event driver requires explicit review.",
  },
];


export function
classifyEventDriverOverlap(
  driver:
    RiskDriver,
): ComponentOverlapRule {
  const rule =
    COMPONENT_OVERLAP_RULES.find(
      item =>
        item.event_driver ===
        driver,
    );


  if (!rule) {
    return {
      event_driver:
        driver,

      overlaps_with:
        [],

      status:
        "REVIEW_REQUIRED",

      rationale:
        "Driver has no explicit overlap classification.",
    };
  }


  return rule;
}
