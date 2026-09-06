import {
  STRUCTURAL_DATASET_POLICY,
  CURRENT_EVENT_FEED_POLICY,
  ON_DEMAND_RETRIEVAL_POLICY,
} from "../src/lib/intelligence-source-classification";

import {
  CURRENT_EVENT_PIPELINES,
  GDELT_SOURCE_IDENTITIES,
} from "../src/lib/current-event-pipeline-contract";


if (
  !STRUCTURAL_DATASET_POLICY
    .eligible_for_structural_scoring
) {
  throw new Error(
    "Structural dataset must support structural scoring",
  );
}


if (
  CURRENT_EVENT_FEED_POLICY
    .eligible_for_structural_scoring
) {
  throw new Error(
    "Current-event feed must not enter structural scoring",
  );
}


if (
  !CURRENT_EVENT_FEED_POLICY
    .retain_private_canonical_evidence
) {
  throw new Error(
    "Current-event evidence must support private canonical retention",
  );
}


if (
  CURRENT_EVENT_FEED_POLICY
    .allow_raw_customer_redistribution
) {
  throw new Error(
    "Raw current-event evidence must not be customer-redistributable by default",
  );
}


if (
  ON_DEMAND_RETRIEVAL_POLICY
    .eligible_for_current_event_scoring
) {
  throw new Error(
    "On-demand retrieval must not silently enter GRO scoring",
  );
}


if (
  ON_DEMAND_RETRIEVAL_POLICY
    .retain_private_canonical_evidence
) {
  throw new Error(
    "On-demand retrieval must remain ephemeral by default",
  );
}


if (
  CURRENT_EVENT_PIPELINES
    .CANONICAL_COUNTRY_RISK
    .structured_store !==
    "live_structured_events"
) {
  throw new Error(
    "Canonical country-risk pipeline store mismatch",
  );
}


if (
  CURRENT_EVENT_PIPELINES
    .LEGACY_EVENTS
    .ask_consumer !==
    true
) {
  throw new Error(
    "Ask Geomacro current legacy path mismatch",
  );
}


const canonicalGdeltSource: string =
  GDELT_SOURCE_IDENTITIES
    .canonical_live_stream;

const governedGdeltCandidate: string =
  GDELT_SOURCE_IDENTITIES
    .governed_external_registry_candidate;


if (
  canonicalGdeltSource ===
  governedGdeltCandidate
) {
  throw new Error(
    "Distinct GDELT identifiers must not be silently collapsed",
  );
}


console.log(
  "PASS: PRIVATE CANONICAL RETENTION != RAW CUSTOMER REDISTRIBUTION",
);

console.log(
  "PASS: ON-DEMAND RETRIEVAL REMAINS EPHEMERAL AND NON-SCORING",
);

console.log(
  "PASS: COUNTRY-RISK AND LEGACY EVENTS PIPELINES ARE EXPLICIT",
);

console.log(
  "PASS: gdelt_gal AND gdelt_v2 ARE NOT SILENTLY MERGED",
);
