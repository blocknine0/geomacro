export const SANCTIONS_SOURCE_CONTRACT_VERSION =
  "sanctions-source-contract-v0.1.0" as const;


export type SanctionsSourceKey =
  | "ofac_sdn"
  | "ofac_non_sdn_consolidated"
  | "unsc_consolidated";


export type SanctionsCommercialGate =
  | "REVIEW_REQUIRED";


export type SanctionsImplementationGate =
  | "INTERFACE_VERIFIED"
  | "INTERFACE_DISCOVERY_REQUIRED";


export type SanctionsSourceContract = {
  source_key:
    SanctionsSourceKey;

  authority:
    "US_OFAC" |
    "UN_SECURITY_COUNCIL";

  dimension:
    "SANCTIONS_COERCION";

  source_class:
    "STRUCTURAL_DATASET";

  commercial_gate:
    SanctionsCommercialGate;

  implementation_gate:
    SanctionsImplementationGate;

  customer_raw_redistribution:
    false;

  scoring_status:
    "EVIDENCE_ONLY_NOT_IN_GRO_V02";

  intended_role:
    "PRIMARY_STRUCTURAL" |
    "SECONDARY_STRUCTURAL";

  notes:
    string;
};


export const SANCTIONS_SOURCES:
  readonly SanctionsSourceContract[] = [
  {
    source_key:
      "ofac_sdn",

    authority:
      "US_OFAC",

    dimension:
      "SANCTIONS_COERCION",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_gate:
      "REVIEW_REQUIRED",

    implementation_gate:
      "INTERFACE_VERIFIED",

    customer_raw_redistribution:
      false,

    scoring_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02",

    intended_role:
      "PRIMARY_STRUCTURAL",

    notes:
      "Official OFAC SDN source. Public machine-readable interface verified; commercial/reuse review remains deliberately open.",
  },

  {
    source_key:
      "ofac_non_sdn_consolidated",

    authority:
      "US_OFAC",

    dimension:
      "SANCTIONS_COERCION",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_gate:
      "REVIEW_REQUIRED",

    implementation_gate:
      "INTERFACE_VERIFIED",

    customer_raw_redistribution:
      false,

    scoring_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02",

    intended_role:
      "PRIMARY_STRUCTURAL",

    notes:
      "Official OFAC non-SDN consolidated source. Kept distinct from SDN semantics.",
  },

  {
    source_key:
      "unsc_consolidated",

    authority:
      "UN_SECURITY_COUNCIL",

    dimension:
      "SANCTIONS_COERCION",

    source_class:
      "STRUCTURAL_DATASET",

    commercial_gate:
      "REVIEW_REQUIRED",

    implementation_gate:
      "INTERFACE_VERIFIED",

    customer_raw_redistribution:
      false,

    scoring_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02",

    intended_role:
      "SECONDARY_STRUCTURAL",

    notes:
      "Official UN Security Council Consolidated List. XML availability is documented; exact production download interface must be pinned before implementation.",
  },
] as const;


export function getSanctionsSource(
  sourceKey:
    SanctionsSourceKey,
): SanctionsSourceContract {
  const source =
    SANCTIONS_SOURCES.find(
      candidate =>
        candidate.source_key ===
        sourceKey,
    );

  if (!source) {
    throw new Error(
      `Unknown sanctions source: ${sourceKey}`,
    );
  }

  return source;
}
