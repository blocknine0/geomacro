# User-Facing Data Boundary Policy

**Status: PERMANENT PRODUCT RULE**

Geomacro maintains a strict boundary between internal evidence/retrieval infrastructure and every user-facing product surface.

This policy applies to **all current and future live Geomacro capabilities**, including the website, UI, Ask Geomacro, APIs, Risk Intelligence, Risk Indices, Risk Objects, Risk Gate, agent interfaces, paid delivery, and any future product surface that exposes information to a user or external system.

## Required user-facing contract

User-facing responses and payloads MUST NOT expose:

1. raw source URLs;
2. raw article, document, feed or source content;
3. internal search or retrieval payloads;
4. provider names, provider/API implementation details or internal search infrastructure details;
5. internal provenance, retrieval metadata, scoring metadata or other internal implementation metadata that is not part of the approved public product contract.

User-facing output MUST be:

- structured;
- concise;
- decision-useful;
- limited to fields explicitly approved by the public product contract.

## Internal processing is not public output

Geomacro may use sources, retrieval systems, providers, provenance, timestamps, ranking signals and other internal evidence to produce verified intelligence.

Those internal inputs remain behind the product boundary.

The permitted flow is:

Raw/Internal Evidence -> Retrieval/Verification/Processing -> Approved Structured Intelligence -> User/External System

There MUST NOT be a direct path from internal raw evidence or retrieval payloads to a user-facing response.

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
- authentication or entitlement error paths.

A field that is not approved for public delivery MUST NOT be included merely because the frontend does not currently render it.

## Structured-only principle

If a feature needs source material internally, the external contract must return the processed intelligence rather than the raw material.

For example, an internal web result may contain a URL, article text, provider metadata and retrieval fields. The public response may instead contain approved structured fields such as an answer, key points, confidence, freshness or risk implication, where those fields are part of the feature contract.

Raw source material is not an acceptable fallback.

## Production gate

Any new or materially changed live capability that violates this policy is **not production-ready** until the boundary is corrected and the relevant tests/acceptance checks pass.

This policy is permanent unless the product owner deliberately replaces it with a new repository-level policy.

## Scope

This is a repository-level product/security requirement, not an Ask Geomacro-specific implementation detail.

Future contributors and agents must preserve this boundary when changing existing functionality or adding new functionality.