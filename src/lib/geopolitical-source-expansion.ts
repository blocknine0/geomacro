import type {
  GeopoliticalDimension,
} from "./geopolitics-dimension-coverage";

import type {
  IntelligenceSourceClass,
} from "./intelligence-source-classification";


export const GEOPOLITICAL_SOURCE_EXPANSION_VERSION =
  "geopolitical-source-expansion-v0.1.0" as const;


export type SourceCommercialStatus =
  | "VERIFIED_OPEN_COMMERCIAL"
  | "OFFICIAL_PUBLIC_SOURCE_REVIEW_REQUIRED"
  | "PERMISSION_REQUIRED"
  | "BLOCKED_BY_LICENSE"
  | "EXISTING_APPROVED";


export type SourceImplementationStatus =
  | "LIVE"
  | "READY_FOR_IMPLEMENTATION"
  | "REVIEW_BEFORE_IMPLEMENTATION"
  | "DO_NOT_IMPLEMENT";


export type GeopoliticalSourceCandidate = {
  source_key:
    string;

  source_label:
    string;

  dimension:
    GeopoliticalDimension;

  source_class:
    IntelligenceSourceClass;

  commercial_status:
    SourceCommercialStatus;

  implementation_status:
    SourceImplementationStatus;

  expected_role:
    "PRIMARY_STRUCTURAL" |
    "SECONDARY_STRUCTURAL" |
    "CURRENT_EVENT_DISCOVERY" |
    "REFERENCE_ONLY";

  raw_customer_redistribution:
    false;

  notes:
    string;
};


export const GEOPOLITICAL_SOURCE_EXPANSION:
  readonly GeopoliticalSourceCandidate[] = [

  /*
   * Existing production structural pillar.
   */
  {
    source_key:
      "unhcr_refugee_statistics",

    source_label:
      "UNHCR Refugee Statistics",

    dimension:
      "FORCED_DISPLACEMENT",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_status:
      "EXISTING_APPROVED",

    implementation_status:
      "LIVE",

    expected_role:
      "PRIMARY_STRUCTURAL",

    raw_customer_redistribution:
      false,

    notes:
      "Existing Geomacro forced-displacement structural pillar.",
  },


  /*
   * UCDP datasets are CC BY 4.0.
   *
   * Use versioned datasets and preserve
   * attribution + dataset version.
   */
  {
    source_key:
      "ucdp_ged",

    source_label:
      "UCDP Georeferenced Event Dataset",

    dimension:
      "CONFLICT_EXPOSURE",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_status:
      "VERIFIED_OPEN_COMMERCIAL",

    implementation_status:
      "READY_FOR_IMPLEMENTATION",

    expected_role:
      "PRIMARY_STRUCTURAL",

    raw_customer_redistribution:
      false,

    notes:
      "Versioned organized-violence event data; derive Geomacro country conflict exposure rather than redistributing raw rows.",
  },


  {
    source_key:
      "ucdp_dyadic",

    source_label:
      "UCDP Dyadic Dataset",

    dimension:
      "INTERSTATE_TENSION",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_status:
      "VERIFIED_OPEN_COMMERCIAL",

    implementation_status:
      "READY_FOR_IMPLEMENTATION",

    expected_role:
      "PRIMARY_STRUCTURAL",

    raw_customer_redistribution:
      false,

    notes:
      "Candidate basis for state/dyad structural tension exposure; methodology must be versioned before scoring.",
  },


  /*
   * World Bank Worldwide Governance Indicators.
   */
  {
    source_key:
      "world_bank_wgi_political_stability",

    source_label:
      "World Bank WGI Political Stability",

    dimension:
      "POLITICAL_INSTABILITY",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_status:
      "VERIFIED_OPEN_COMMERCIAL",

    implementation_status:
      "READY_FOR_IMPLEMENTATION",

    expected_role:
      "PRIMARY_STRUCTURAL",

    raw_customer_redistribution:
      false,

    notes:
      "Annual political-stability governance indicator; keep separate from current-event instability evidence.",
  },


  /*
   * Official sanctions sources.
   *
   * Operationally attractive, but Geomacro
   * keeps explicit commercial/reuse review
   * before production scoring.
   */
  {
    source_key:
      "ofac_sanctions",

    source_label:
      "US OFAC Sanctions List Service",

    dimension:
      "SANCTIONS_COERCION",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_status:
      "OFFICIAL_PUBLIC_SOURCE_REVIEW_REQUIRED",

    implementation_status:
      "REVIEW_BEFORE_IMPLEMENTATION",

    expected_role:
      "PRIMARY_STRUCTURAL",

    raw_customer_redistribution:
      false,

    notes:
      "Official sanctions-list/API source; build derived country sanctions-pressure signals after final reuse review.",
  },


  {
    source_key:
      "unsc_sanctions",

    source_label:
      "UN Security Council Sanctions Lists",

    dimension:
      "SANCTIONS_COERCION",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_status:
      "OFFICIAL_PUBLIC_SOURCE_REVIEW_REQUIRED",

    implementation_status:
      "REVIEW_BEFORE_IMPLEMENTATION",

    expected_role:
      "SECONDARY_STRUCTURAL",

    raw_customer_redistribution:
      false,

    notes:
      "Official UN sanctions lists; XML availability exists for multiple regimes.",
  },


  /*
   * Existing current-event backbone.
   */
  {
    source_key:
      "gdelt_gal",

    source_label:
      "GDELT GAL",

    dimension:
      "CONFLICT_EXPOSURE",

    source_class:
      "CURRENT_EVENT_FEED",

    commercial_status:
      "VERIFIED_OPEN_COMMERCIAL",

    implementation_status:
      "LIVE",

    expected_role:
      "CURRENT_EVENT_DISCOVERY",

    raw_customer_redistribution:
      false,

    notes:
      "Global current-event discovery backbone; internal canonical evidence retention, structured outputs only.",
  },


  /*
   * Do not build a commercial dependency
   * on ACLED under current terms.
   */
  {
    source_key:
      "acled",

    source_label:
      "ACLED",

    dimension:
      "CONFLICT_EXPOSURE",

    source_class:
      "REFERENCE_CONTEXT",

    commercial_status:
      "BLOCKED_BY_LICENSE",

    implementation_status:
      "DO_NOT_IMPLEMENT",

    expected_role:
      "REFERENCE_ONLY",

    raw_customer_redistribution:
      false,

    notes:
      "Commercial and competitive-use restrictions make this unsuitable as a default Geomacro dependency without a negotiated licence.",
  },
] as const;


export function getCandidatesForDimension(
  dimension:
    GeopoliticalDimension,
): readonly GeopoliticalSourceCandidate[] {
  return GEOPOLITICAL_SOURCE_EXPANSION.filter(
    source =>
      source.dimension ===
      dimension,
  );
}


export function getReadyStructuralSources():
  readonly GeopoliticalSourceCandidate[] {
  return GEOPOLITICAL_SOURCE_EXPANSION.filter(
    source =>
      source.source_class ===
        "STRUCTURAL_DATASET" &&
      (
        source.implementation_status ===
          "LIVE" ||
        source.implementation_status ===
          "READY_FOR_IMPLEMENTATION"
      ),
  );
}
