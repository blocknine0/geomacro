# Derived Risk Gate review automation — Step 1 (2026-11-04)

## Objective
Turn non-commercial/private news into a **discovery signal**, not a commercial content licence. Recheck a signal when independent official evidence or a newly signed facts-only GRI v1.2 score arrives. Keep paid delivery **locked** until the separate commercial gates run.

## Implemented entrypoints
- \`resolveDerivedCommercialEligibility(source)\` remains the independent rights, evidence and dual-Ed25519 GRI score verifier.
- \`advanceDerivedRiskGateReview(source)\` is the repeatable one-item transition.
- \`reviewDerivedRiskGateBatch(sources)\` is a bounded (<=500) in-memory review pass with event-fingerprint de-duplication.

No network requests, publisher article retrieval, database writes, cron scheduling, customer API exposure, signing key issuance, PREDGE modifications, or payment unlock are made in this step.

## Four stages
1. \`HOLD_SOURCE_ACCESS_OR_EXPRESSION\`: source access, terms, attribution or expression restrictions not satisfied.
2. \`PENDING_CORROBORATION\`: restricted non-commercial source or GDELT metadata is an unverified signal. Retrieve independently authorized official primary documents or independent licensed open datasets, verify same event and original publication time, issuer/rights and immutable content hash.
3. \`PENDING_INDEPENDENT_SCORE_AUDIT\`: independently corroborated fact, but no recomputed dual-signed GRI v1.2 proof.
4. \`DERIVED_FACTS_READY_FOR_DELIVERY_REVIEW\`: dual-signed audited facts and one corresponding structured score row. Still **not paid-delivery authorized**.

\`PENDING_EVENT_SCORE_BINDING\` blocks an otherwise valid aggregate GRI proof unless exactly one signed score row matches the claimed event code with a valid category and severity.

## Strict structured output
Only the final stage emits a candidate with:
\`event_type, country_iso3, domain, severity_impact, recorded_fact, risk_score_0_100, factual_record_sha256, score_calculation_sha256, evidence\`.

\`recorded_fact\` is the **verified event code**, not an arbitrary journalist sentence. \`severity_impact\` is taken from the matched signed score event row, while \`risk_score_0_100\` is taken from the independently recomputed GRI proof. Supporting evidence entries contain only independently validated issuer, evidence URL, kind and immutable content hash. No original publisher title, article body or copied prose is returned.

## Operational handoff
Integrate the pure loop in a future ingestion task: new authorized signal -> primary-evidence lookup -> independent verification -> signed score proof -> call loop again -> separate paid-delivery entitlement, GRO signing and product review. Only sources whose actual use terms authorize the required fetching and processing may enter the flow. A public source or GDELT event code alone confers **no** rights to reproduce its underlying news article, and government primary sources can have third-party exclusions.

Tests:
\`node --test scripts/lib/derived-risk-gate-review-loop.test.mjs scripts/lib/facts-only-gri-v12-dual-attestation.test.mjs\`

This is an implementation of **Step 1**, not a claim that every producer or paid API is wired or that live production tests passed.
