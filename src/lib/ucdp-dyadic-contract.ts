export const UCDP_DYADIC_CONTRACT_VERSION =
  "ucdp-dyadic-contract-v0.1.0" as const;

export const UCDP_DYADIC_DATASET_VERSION =
  "26.1" as const;

export const UCDP_DYADIC_SOURCE_ID =
  "ucdp_dyadic" as const;


export type UcdpDyadicRawRecord = {
  dyad_id?:
    number | string;

  conflict_id?:
    number | string;

  location?:
    string;

  side_a?:
    string;

  side_a_id?:
    number | string;

  side_b?:
    string;

  side_b_id?:
    number | string;

  year?:
    number | string;

  type_of_conflict?:
    number | string;

  intensity_level?:
    number | string;

  incompatibility?:
    number | string;

  territory_name?:
    string | null;

  start_date?:
    string;

  start_date2?:
    string;

  ep_end_date?:
    string | null;

  [key:
    string]:
    unknown;
};


export type UcdpInterstateDyadEvidence = {
  contract_version:
    typeof UCDP_DYADIC_CONTRACT_VERSION;

  source_id:
    typeof UCDP_DYADIC_SOURCE_ID;

  dataset_version:
    typeof UCDP_DYADIC_DATASET_VERSION;

  dyad_id:
    string;

  conflict_id:
    string;

  year:
    number;

  side_a:
    string;

  side_a_id:
    string;

  side_b:
    string;

  side_b_id:
    string;

  type_of_conflict:
    2;

  intensity_level:
    number | null;

  location:
    string | null;

  start_date:
    string | null;

  start_date2:
    string | null;

  ep_end_date:
    string | null;

  dimension:
    "INTERSTATE_TENSION";

  source_class:
    "STRUCTURAL_DATASET";

  methodology_status:
    "EVIDENCE_ONLY_NOT_IN_GRO_V02";
};


export type UcdpDyadicTransformResult =
  | {
      status:
        "ACCEPTED";

      evidence:
        UcdpInterstateDyadEvidence;
    }
  | {
      status:
        "REJECTED";

      reason:
        string;
    };


function requiredString(
  value:
    unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim();

  return normalized
    ? normalized
    : null;
}


function integer(
  value:
    unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric =
    Number(value);

  return Number.isInteger(
    numeric,
  )
    ? numeric
    : null;
}


export function transformUcdpDyadicRecord(
  raw:
    UcdpDyadicRawRecord,
): UcdpDyadicTransformResult {

  const typeOfConflict =
    integer(
      raw.type_of_conflict,
    );


  if (
    typeOfConflict !==
    2
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "not_interstate_conflict",
    };
  }


  const dyadId =
    requiredString(
      raw.dyad_id,
    );

  const conflictId =
    requiredString(
      raw.conflict_id,
    );

  const year =
    integer(
      raw.year,
    );

  const sideA =
    requiredString(
      raw.side_a,
    );

  const sideAId =
    requiredString(
      raw.side_a_id,
    );

  const sideB =
    requiredString(
      raw.side_b,
    );

  const sideBId =
    requiredString(
      raw.side_b_id,
    );


  if (
    !dyadId ||
    !conflictId ||
    !year ||
    !sideA ||
    !sideAId ||
    !sideB ||
    !sideBId
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "missing_required_dyad_identity",
    };
  }


  if (
    year < 1946 ||
    year > 2100
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_year",
    };
  }


  const intensity =
    integer(
      raw.intensity_level,
    );


  if (
    intensity !== null &&
    intensity !== 1 &&
    intensity !== 2
  ) {
    return {
      status:
        "REJECTED",

      reason:
        "invalid_intensity_level",
    };
  }


  return {
    status:
      "ACCEPTED",

    evidence: {
      contract_version:
        UCDP_DYADIC_CONTRACT_VERSION,

      source_id:
        UCDP_DYADIC_SOURCE_ID,

      dataset_version:
        UCDP_DYADIC_DATASET_VERSION,

      dyad_id:
        dyadId,

      conflict_id:
        conflictId,

      year,

      side_a:
        sideA,

      side_a_id:
        sideAId,

      side_b:
        sideB,

      side_b_id:
        sideBId,

      type_of_conflict:
        2,

      intensity_level:
        intensity,

      location:
        requiredString(
          raw.location,
        ),

      start_date:
        requiredString(
          raw.start_date,
        ),

      start_date2:
        requiredString(
          raw.start_date2,
        ),

      ep_end_date:
        requiredString(
          raw.ep_end_date,
        ),

      dimension:
        "INTERSTATE_TENSION",

      source_class:
        "STRUCTURAL_DATASET",

      methodology_status:
        "EVIDENCE_ONLY_NOT_IN_GRO_V02",
    },
  };
}
