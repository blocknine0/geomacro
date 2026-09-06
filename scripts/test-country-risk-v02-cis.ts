import assert from "node:assert/strict";

import {
  buildCountryRiskV02Context,
} from "../src/lib/country-risk-v02-cis-engine";

import {
  getLatestCountryIntelligenceState,
} from "../src/lib/country-intelligence-state-store.server";

const cis =
  await getLatestCountryIntelligenceState(
    "IND",
  );

assert.ok(
  cis,
  "India CIS must exist",
);

const first =
  buildCountryRiskV02Context(
    cis,
  );

const second =
  buildCountryRiskV02Context(
    cis,
  );

assert.deepEqual(
  first,
  second,
  "CIS -> GRO v0.2 context must be deterministic",
);

assert.equal(
  first.cis_state_id,
  cis.state_id,
);

assert.equal(
  first.cis_calculation_hash,
  cis.hashes.calculation_hash,
);

assert.equal(
  first.components.length,
  3,
);

assert.deepEqual(
  first.components.map(
    (item) => item.category,
  ),
  [
    "MACRO",
    "GEOPOLITICS",
    "CRITICAL_MINERALS",
  ],
);

for (
  const component of
    first.components
) {
  assert.equal(
    component.directional_risk_score,
    null,
  );

  assert.equal(
    component.score_contribution,
    0,
  );

  assert.ok(
    component.confidence_factor >=
      0 &&
      component.confidence_factor <=
        1,
  );

  assert.ok(
    component.feature_refs.length ===
      component.feature_count,
  );
}

console.log(
  "===== GRO v0.2 CIS CONTEXT =====",
);

console.log({
  methodology_version:
    first.methodology_version,

  cis_state_id:
    first.cis_state_id,

  cis_calculation_hash:
    first.cis_calculation_hash,
});

console.table(
  first.components.map(
    (item) => ({
      category:
        item.category,

      coverage:
        item.coverage_status,

      features:
        item.feature_count,

      current:
        item.current_feature_count,

      stale:
        item.stale_feature_count,

      sources:
        item.source_count,

      freshness_factor:
        item.freshness_factor,

      coverage_factor:
        item.coverage_factor,

      confidence_factor:
        item.confidence_factor,

      directional_risk_score:
        item.directional_risk_score,

      score_contribution:
        item.score_contribution,
    }),
  ),
);

console.log(
  "PASS: GRO v0.2 CIS CONTEXT DETERMINISTIC",
);

console.log(
  "PASS: NO UNSUPPORTED CIS DIRECTIONAL SCORING INTRODUCED",
);
