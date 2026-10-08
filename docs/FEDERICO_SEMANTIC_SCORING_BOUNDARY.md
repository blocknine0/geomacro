# Federico strict: semantic scoring and receiver admission boundary

Status: binding issuer-side fail-closed rule; **not** receiver approval.

## Observed production rejection

A signed, independently corroborated allegation concerning Venezuela's president was supplied to the receiver with `driver="other"`, `severity=0`, `risk.score=0`, `label=CALM`. The receiver independently checked source existence, country nexus and title/type entailment, then rejected the material numerical inputs. A matching `calculation_hash` proves only faithful re-execution of issuer-supplied inputs, not that the inputs are true.

## Current hard gates before signing

For `FEDERICO_STRICT` only:

- Every included event must carry a finite, **positive** severity and confidence, a relevance weight in (0, 1], and a classified event driver.
- Signed evidence values and deterministic `calculation_input.events` must agree on event IDs, types, severity, confidence and relevance weight.
- A material evidence set cannot be reported as zero-risk/CALM by defaulting missing values to zero.
- An unclassified `GEOPOLITICS_BREAKING` event does not become a political-instability claim or get an invented severity; **the publisher rejects it** until its classification and severity are supported.
- Keep the existing at-most-6h true publisher timestamps, independent provider-family verification, signed record integrity, commercial source rights, B2/D1 continuity and zero-user-fund boundary.

## What remains external

A provider may independently establish whether the **claimed** classification, severity, confidence, materiality, attribution/relevance and inclusion/exclusion decisions follow from its own source records and agreed scoring policy. The issuer cannot turn a cryptographically correct, self-selected numerical score into an independently verified fact.

**Only a signed Federico `approve` verdict with zero issues and independently verified proof is successful admission.** A signed `reject` verdict remains a failure even if HTTP 200, a payment allowance, or local verification succeeded. Before another live review, obtain a receiver-verifiable scoring policy or a specific valid semantic scoring example; do not lower thresholds or arbitrarily raise severities.
