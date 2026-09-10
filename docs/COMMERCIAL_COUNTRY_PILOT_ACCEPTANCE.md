# Commercial Country Private-Pilot Acceptance

This gate is for a controlled country-risk Private Pilot / Early Access proof. It is not a GA, production-SLA, external-audit, or corridor-methodology certification claim.

## Evidence required

A country passes this gate only when a fresh immutable Geomacro Risk Object is published and all of the following are true:

- schema/signature verification passes under the current Ed25519 signing key;
- `commercial_eligibility.status = VERIFIED`;
- `verification.status = VERIFIED`;
- when derived-only evidence is used, `derived_only_delivery_no_raw_redistribution` is preserved in the signed commercial eligibility reasons;
- the authenticated production Risk Gate accepts the country subject;
- exact replay returns the same audit id and the replay header;
- a changed payload with the same request id returns `IDEMPOTENCY_CONFLICT`;
- every Risk Gate response preserves `execution_authorized=false`.

## Current source boundary

`DERIVED_ONLY` evidence may support derived commercial intelligence where the reviewed source policy permits that use. It does not authorize redistribution of publisher article bodies, images, excerpts, private/raw warehouse payloads, or other source content outside the allowed delivery contract.

`UNVERIFIED`, `REVIEW_REQUIRED`, missing-policy, and `INELIGIBLE` evidence must continue to fail closed.

## Corridor boundary

Country acceptance does not validate the current corridor methodology. `corridor-endpoint-max-v0.1.0-pilot` remains separately labelled and independently unverified. A passing country workflow must therefore emit `corridor_methodology_verified=false`.

## First evidence-bearing pair

The September 10, 2026 readiness run identified CHN and BRA as a clean pair for the first country acceptance proof because both had commercially usable recent evidence and zero blocking recent events at the time of that run. That observation is time-bounded; the workflow must re-evaluate by publishing fresh objects at execution time rather than assuming the earlier state remains valid.
