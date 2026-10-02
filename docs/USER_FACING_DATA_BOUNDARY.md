# User-Facing Data Boundary Policy

**Status: PERMANENT PRODUCT RULE**

Geomacro maintains a strict boundary between internal evidence/retrieval infrastructure and every user-facing product surface.

This policy applies to **all current and future live Geomacro capabilities**, including the website, UI, Ask Geomacro, APIs, Risk Intelligence, Risk Indices, Risk Objects, Risk Gate, agent interfaces, paid delivery, and any future product surface that exposes information to a user or external system.

## Required user-facing contract

User-facing responses and payloads MUST NOT expose:

1. raw source URLs;
2. raw article, document, feed or source content;
3. internal search or retrieval payloads;
4. source/provider names, source IDs, provider/API implementation details or internal search infrastructure details;
5. source-contract, licence or rights-review metadata;
6. internal provenance, retrieval metadata, source-normalized hashes, scoring metadata or other internal implementation metadata that is not part of the approved public product contract.

User-facing output MUST be:

- structured;
- concise;
- decision-useful;
- Geomacro-derived;
- limited to fields explicitly approved by the public product contract.

## Internal processing is not public output

Geomacro may use sources, retrieval systems, providers, provenance, timestamps, ranking signals and other internal evidence to produce verified intelligence.

Those internal inputs remain behind the product boundary.

The permitted flow is:

Raw/Internal Evidence -> Retrieval/Verification/Processing -> Approved Geomacro Structured Intelligence -> User/External System

There MUST NOT be a direct path from internal raw evidence, source identity, source-contract metadata or retrieval payloads to a user-facing response.

## Commercial paid-output rule

Payment is for Geomacro's structured intelligence computation/output, not for resale of an upstream source feed.

A source may influence paid output only when it is internally approved for commercial derived use, explicitly enabled for commercial signals, technically certified and currently deliverable. Raw redistribution permission is tracked internally where relevant, but it is not a requirement for a product that never redistributes the raw material.

Sources that are permission-pending, review-pending, uncertified, disabled for commercial signals, stale or technically unavailable remain outside the paid computation graph.

Where an upstream licence requires attribution/credit, Geomacro must satisfy that obligation through the approved centralized legal/methodology/attribution mechanism or other legally adequate product-level mechanism without leaking internal source-selection or source-contract metadata into each query response.

## No hidden leakage

The rule applies to more than visible text.

Before a capability is considered production-ready, its user-facing boundary must be checked for leakage through:

- API JSON responses;
- server-rendered data;
- client-side state;
- HTML/DOM payloads;
- browser-visible application data;
- error responses;
- debug responses;
- telemetry or diagnostics that are returned to the user;
- embedded metadata;
- structured response fields;
- fallback paths;
- payment-required responses;
- persisted/replayed paid responses;
- authentication or entitlement error paths.

A field that is not approved for public delivery MUST NOT be included merely because the frontend does not currently render it.

## Structured-only principle

If a feature needs source material internally, the external contract must return the processed intelligence rather than the raw material.

For example, an internal web result may contain a URL, article text, provider metadata and retrieval fields. The public response may instead contain approved structured fields such as an answer, key points, confidence, freshness, risk implication, drivers, scores or bounded decision context, where those fields are part of the feature contract.

Raw source material and source identity are not acceptable fallbacks.

## Production gate

Any new or materially changed live capability that violates this policy is **not production-ready** until the boundary is corrected and the relevant tests/acceptance checks pass.

For paid machine delivery, the final payload must pass the source-free response boundary before durable preparation or settlement. Replayed legacy payloads must pass the same sanitation and validation boundary before being returned.

This policy is permanent unless the product owner deliberately replaces it with a new repository-level policy.

## Scope

This is a repository-level product/security requirement, not an Ask Geomacro-specific implementation detail.

Future contributors and agents must preserve this boundary when changing existing functionality or adding new functionality.
