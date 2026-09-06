export const INTELLIGENCE_SOURCE_CLASSIFICATION_VERSION =
  "intelligence-source-classification-v0.2.0" as const;


export type IntelligenceSourceClass =
  | "STRUCTURAL_DATASET"
  | "CURRENT_EVENT_FEED"
  | "ON_DEMAND_RETRIEVAL"
  | "REFERENCE_CONTEXT";


export type IntelligenceUsageSurface =
  | "GRI"
  | "GRO"
  | "RISK_GATE"
  | "ASK_GEOMACRO"
  | "AGENT_API";


export type IntelligenceSourcePolicy = {
  source_class:
    IntelligenceSourceClass;

  persist_normalized_evidence:
    boolean;

  /*
   * Internal canonical evidence retention is
   * distinct from raw-data redistribution.
   *
   * Example:
   * GDELT GAL evidence may be retained inside
   * private immutable compressed storage for
   * audit/provenance without being exposed or
   * resold as raw third-party content.
   */
  retain_private_canonical_evidence:
    boolean;

  allow_raw_customer_redistribution:
    boolean;

  eligible_for_structural_scoring:
    boolean;

  eligible_for_current_event_scoring:
    boolean;

  eligible_for_on_demand_answering:
    boolean;

  allowed_surfaces:
    IntelligenceUsageSurface[];
};


export const STRUCTURAL_DATASET_POLICY:
  IntelligenceSourcePolicy = {
    source_class:
      "STRUCTURAL_DATASET",

    persist_normalized_evidence:
      true,

    retain_private_canonical_evidence:
      true,

    allow_raw_customer_redistribution:
      false,

    eligible_for_structural_scoring:
      true,

    eligible_for_current_event_scoring:
      false,

    eligible_for_on_demand_answering:
      true,

    allowed_surfaces: [
      "GRI",
      "GRO",
      "RISK_GATE",
      "ASK_GEOMACRO",
      "AGENT_API",
    ],
  };


export const CURRENT_EVENT_FEED_POLICY:
  IntelligenceSourcePolicy = {
    source_class:
      "CURRENT_EVENT_FEED",

    persist_normalized_evidence:
      true,

    retain_private_canonical_evidence:
      true,

    allow_raw_customer_redistribution:
      false,

    eligible_for_structural_scoring:
      false,

    eligible_for_current_event_scoring:
      true,

    eligible_for_on_demand_answering:
      true,

    allowed_surfaces: [
      "GRO",
      "RISK_GATE",
      "ASK_GEOMACRO",
      "AGENT_API",
    ],
  };


export const ON_DEMAND_RETRIEVAL_POLICY:
  IntelligenceSourcePolicy = {
    source_class:
      "ON_DEMAND_RETRIEVAL",

    persist_normalized_evidence:
      false,

    retain_private_canonical_evidence:
      false,

    allow_raw_customer_redistribution:
      false,

    eligible_for_structural_scoring:
      false,

    eligible_for_current_event_scoring:
      false,

    eligible_for_on_demand_answering:
      true,

    allowed_surfaces: [
      "RISK_GATE",
      "ASK_GEOMACRO",
      "AGENT_API",
    ],
  };


export const REFERENCE_CONTEXT_POLICY:
  IntelligenceSourcePolicy = {
    source_class:
      "REFERENCE_CONTEXT",

    persist_normalized_evidence:
      false,

    retain_private_canonical_evidence:
      false,

    allow_raw_customer_redistribution:
      false,

    eligible_for_structural_scoring:
      false,

    eligible_for_current_event_scoring:
      false,

    eligible_for_on_demand_answering:
      true,

    allowed_surfaces: [
      "ASK_GEOMACRO",
      "AGENT_API",
    ],
  };
