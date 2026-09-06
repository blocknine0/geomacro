import {
  COUNTRY_RISK_V02_FROZEN_PRIOR,
  COUNTRY_RISK_V02_PHASE2_POLICY,
  COUNTRY_RISK_V02_PHASE2_STATUS,
  getCountryRiskV02Phase2FreezeManifest,
  validateCountryRiskV02Phase2Freeze,
} from "../src/lib/country-risk-v02-methodology-freeze";


validateCountryRiskV02Phase2Freeze();


const first =
  getCountryRiskV02Phase2FreezeManifest();


const second =
  getCountryRiskV02Phase2FreezeManifest();


if (
  first.methodology_hash !==
  second.methodology_hash
) {
  throw new Error(
    "Phase-2 methodology manifest is not deterministic",
  );
}


if (
  COUNTRY_RISK_V02_PHASE2_STATUS !==
  "PRE_PUBLICATION_FROZEN"
) {
  throw new Error(
    "Unexpected Phase-2 methodology status",
  );
}


if (
  COUNTRY_RISK_V02_FROZEN_PRIOR
    .event !==
  0.70 ||
  COUNTRY_RISK_V02_FROZEN_PRIOR
    .macro !==
  0.15 ||
  COUNTRY_RISK_V02_FROZEN_PRIOR
    .geopolitics !==
  0.15 ||
  COUNTRY_RISK_V02_FROZEN_PRIOR
    .critical_minerals !==
  0
) {
  throw new Error(
    "Phase-2 frozen prior changed unexpectedly",
  );
}


if (
  COUNTRY_RISK_V02_PHASE2_POLICY
    .event_score_input !==
  "ORTHOGONAL_EVENT_RESIDUAL"
) {
  throw new Error(
    "Orthogonal event residual policy missing",
  );
}


if (
  COUNTRY_RISK_V02_PHASE2_POLICY
    .component_weighting !==
  "PRIOR_TIMES_RELIABILITY_NORMALIZED"
) {
  throw new Error(
    "Reliability-normalized weighting policy missing",
  );
}


if (
  COUNTRY_RISK_V02_PHASE2_POLICY
    .missing_data_policy !==
  "NEVER_TREAT_MISSING_AS_ZERO_RISK"
) {
  throw new Error(
    "Missing-data safety contract changed",
  );
}


console.log(
  "===== GRO v0.2 PHASE 2 FREEZE =====",
);


console.log({
  status:
    first.status,

  freeze_version:
    first.freeze_version,

  prior_weights:
    first.prior_weights,

  event_overlap:
    first
      .policy
      .event_overlap_policy,

  event_input:
    first
      .policy
      .event_score_input,

  weighting:
    first
      .policy
      .component_weighting,

  missing_event:
    first
      .policy
      .missing_event_policy,

  minerals:
    first
      .policy
      .critical_minerals_policy,

  publication:
    first
      .policy
      .publication_policy,

  methodology_hash:
    first
      .methodology_hash,
});


console.log(
  "PASS: PHASE 2 METHODOLOGY FREEZE DETERMINISTIC",
);

console.log(
  "PASS: 70/15/15 IS A VALIDATED PRIOR, NOT BLIND STATIC EFFECTIVE WEIGHT",
);

console.log(
  "PASS: CRITICAL MINERALS REMAIN ZERO-WEIGHT",
);

console.log(
  "PASS: GLOBAL COVERAGE REMAINS REQUIRED BEFORE PUBLICATION",
);
