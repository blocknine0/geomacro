import {
  getOfacProgramAttribution,
  type OfacProgramAttribution,
} from "./ofac-program-jurisdiction-contract";


export const SANCTIONS_EVIDENCE_CONTRACT_VERSION =
  "sanctions-evidence-v0.1.0" as const;


export type SanctionsEvidenceSource =
  | "OFAC_SDN"
  | "OFAC_CONSOLIDATED";


export type SanctionsProgramEvidenceInput = {
  source:
    SanctionsEvidenceSource;

  program:
    string;

  designation_count:
    number;

  retrieved_at:
    string;

  source_url:
    string;
};


export type DirectJurisdictionSanctionsEvidence = {
  contract_version:
    typeof SANCTIONS_EVIDENCE_CONTRACT_VERSION;

  source:
    SanctionsEvidenceSource;

  program:
    string;

  attribution_mode:
    "DIRECT_JURISDICTION";

  jurisdiction_iso3:
    string;

  designation_count:
    number;

  retrieved_at:
    string;

  source_url:
    string;

  dimension:
    "SANCTIONS_COERCION";

  source_class:
    "STRUCTURAL_DATASET";

  methodology_status:
    "EVIDENCE_ONLY_NOT_IN_GRO_V02";

  commercial_status:
    "REVIEW_REQUIRED";
};


export type NonDirectSanctionsEvidence = {
  contract_version:
    typeof SANCTIONS_EVIDENCE_CONTRACT_VERSION;

  source:
    SanctionsEvidenceSource;

  program:
    string;

  attribution_mode:
    "NO_DIRECT_JURISDICTION";

  attribution_reason:
    string;

  designation_count:
    number;

  retrieved_at:
    string;

  source_url:
    string;

  dimension:
    "SANCTIONS_COERCION";

  source_class:
    "STRUCTURAL_DATASET";

  methodology_status:
    "EVIDENCE_ONLY_NOT_IN_GRO_V02";

  commercial_status:
    "REVIEW_REQUIRED";
};


export type SanctionsProgramEvidence =
  | DirectJurisdictionSanctionsEvidence
  | NonDirectSanctionsEvidence;


function validateInput(
  input:
    SanctionsProgramEvidenceInput,
) {
  if (
    !input.program.trim()
  ) {
    throw new Error(
      "Sanctions program is required",
    );
  }

  if (
    !Number.isInteger(
      input.designation_count,
    ) ||
    input.designation_count < 0
  ) {
    throw new Error(
      "designation_count must be a non-negative integer",
    );
  }

  if (
    !Number.isFinite(
      Date.parse(
        input.retrieved_at,
      ),
    )
  ) {
    throw new Error(
      "retrieved_at must be a valid timestamp",
    );
  }

  if (
    !/^https:\/\//.test(
      input.source_url,
    )
  ) {
    throw new Error(
      "source_url must be HTTPS",
    );
  }
}


export function buildSanctionsProgramEvidence(
  input:
    SanctionsProgramEvidenceInput,
): SanctionsProgramEvidence {

  validateInput(
    input,
  );


  const attribution:
    OfacProgramAttribution =
    getOfacProgramAttribution(
      input.program,
    );


  const common = {
    contract_version:
      SANCTIONS_EVIDENCE_CONTRACT_VERSION,

    source:
      input.source,

    program:
      input.program,

    designation_count:
      input.designation_count,

    retrieved_at:
      input.retrieved_at,

    source_url:
      input.source_url,

    dimension:
      "SANCTIONS_COERCION" as const,

    source_class:
      "STRUCTURAL_DATASET" as const,

    methodology_status:
      "EVIDENCE_ONLY_NOT_IN_GRO_V02" as const,

    commercial_status:
      "REVIEW_REQUIRED" as const,
  };


  if (
    attribution.mode ===
      "DIRECT_JURISDICTION"
  ) {
    return {
      ...common,

      attribution_mode:
        "DIRECT_JURISDICTION",

      jurisdiction_iso3:
        attribution.jurisdiction,
    };
  }


  return {
    ...common,

    attribution_mode:
      "NO_DIRECT_JURISDICTION",

    attribution_reason:
      attribution.reason,
  };
}
