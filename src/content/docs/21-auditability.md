# 21. Auditability

Geomacro's current architecture has two complementary audit surfaces: **GRI publication proof** and **Risk Gate decision audit**.

## GRI proof

A published GRI snapshot can retain:

- methodology and proof versions
- methodology hash
- input/evidence/calculation hashes
- disposition and proof hashes where required by the current contract
- raw and display scores
- domain breakdown
- coverage and weighted confidence
- source and independent-story counts
- exact contribution-level attribution
- previous-snapshot change attribution
- classification and story-correlation provenance

The same validated inputs, as-of time and methodology version are expected to reproduce the same deterministic aggregate.

## Risk Gate audit

Authenticated Private Pilot evaluations persist immutable decision-audit records containing enough metadata and hashes to correlate the client, request, subject, Risk Object, policy, decision and response without requiring arbitrary customer payload data to be retained.

## Signed objects

GRO integrity uses a canonical payload hash and Ed25519 issuer signature.

Auditability is not the same as independent certification. Geomacro must not claim third-party security audit, institutional methodology validation or production SLA evidence until those are actually obtained.