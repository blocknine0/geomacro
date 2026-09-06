import assert from "node:assert/strict";

import {
  getLatestCountryIntelligenceState,
} from "../src/lib/country-intelligence-state-store.server";

import {
  auditCountryRiskV02Readiness,
} from "../src/lib/country-risk-v02-readiness";


const iso3 =
  process.argv[2] ??
  "IND";


const cis =
  await getLatestCountryIntelligenceState(
    iso3,
  );


assert.ok(
  cis,
  `Persisted CIS missing for ${iso3}`,
);


const audit =
  auditCountryRiskV02Readiness(
    cis,
  );


console.log(
  "===== GRO v0.2 FEATURE READINESS =====",
);

console.log({
  country:
    audit.country_iso3,

  cis_state_id:
    audit.cis_state_id,

  ...audit.counts,
});


console.table(
  audit.items.map(
    item => ({
      feature:
        item.feature_key,

      freshness:
        item.freshness_status,

      mode:
        item.scoring_mode,

      direction:
        item.direction,

      eligible:
        item.score_eligible,
    }),
  ),
);


const critical =
  audit.items.filter(
    item =>
      item.category ===
      "CRITICAL_MINERALS",
  );


for (
  const item of critical
) {
  assert.equal(
    item.score_eligible,
    false,
    "Raw critical-mineral quantities must not directly alter country risk",
  );
}


const geopolitics =
  audit.items.filter(
    item =>
      item.category ===
      "GEOPOLITICS",
  );


for (
  const item of geopolitics
) {
  assert.equal(
    item.score_eligible,
    false,
    "Absolute displacement metrics must not score before population normalization",
  );
}


console.log(
  "PASS: FEATURE SCORING READINESS AUDIT CLEAN",
);

console.log(
  "PASS: UNSUPPORTED RAW FEATURES REMAIN FAIL-CLOSED",
);
