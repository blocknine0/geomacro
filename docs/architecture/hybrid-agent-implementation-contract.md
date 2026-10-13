# Geomacro Hybrid Agent — implementation contract (2026-10-13)

Status: architecture approved; production acceptance pending. This document does not authorize funds or mark #2124 resolved.

## Goal
One existing governed intelligence engine serves (a) conversational Ask Geomacro and (b) machine/API consumers. No new risk engine or raw-source resale.

## Flow
1. Parse bounded user question into intent, geopolitical/macro-FX/critical-minerals categories, country/corridor, requested freshness, and permitted product.
2. Reuse existing governed Ask Geomacro reader and verified private B2 continuity. Supabase is optional standby, never mandatory.
3. If the question needs fresher evidence, invoke existing bounded ephemeral retrieval with permitted sources, timeouts, cost ceilings, and fallback. Do not treat website-only unscored findings as signed GRO/GRI.
4. Verify timestamps, deduplicate, corroborate, and enforce commercial source eligibility. Missing evidence => explicit insufficient_evidence, no fabricated risk score.
5. Reuse existing canonical Risk Object schema, canonicalization, hashing, signing and independent verification. Do not modify signature semantics or key handling.
6. Project the same verified intelligence into a human conversational explanation or a source-free machine-readable product. A conversation turn cannot mutate or weaken evidence.
7. Machine payment uses existing deterministic query planning, no-charge deliverability preflight, x402 challenge, payment-proof binding, final recheck, durable product preparation, settlement, idempotent delivery and reconciliation. No funds until explicit owner ACK.

## Conversation boundary
- Conversation history is untrusted context; it may resolve follow-up references but never serves as independent evidence.
- Do not expose private source identities, raw source payloads, internal provenance, secrets or upstream contract metadata.
- Keep free public chat separate from paid signed structured intelligence; never advertise unverified signatures.
- Constrain history, tool calls, tokens, retrieval requests and spending; protect against prompt injection and tool-result instructions.
- Accessibility: keyboard operation, streaming status where supported, retry, mobile responsiveness, and explicit evidence freshness/status.

## API contract (design target, not a deployed route)
Input: question, optional conversation_id, optional category/country/corridor, output_mode (chat|structured), requested_freshness.
Output: status (verified|insufficient_evidence|unavailable), answer (when supported), category, evidence_as_of, verified_at, confidence (when justified), product_schema_version, signed_product (only if actually signed and verified), request_id.
Never fabricate an endpoint path, signature or timestamp.

## Preserve existing production
- Do not change website stateless reader, its 15-minute delay, or Global Risk website 60-minute delay.
- Do not weaken verifyHotSnapshot, source/commercial eligibility, payment replay protection, or fail-closed semantics.
- Do not delete unverified B2/Supabase data or SQL-delete storage.objects.
- #2124 remains P0: independent B2/D1 hot-snapshot proof, truly fresh signed state, production health and no-funds x402 preflight.

## Phased implementation and acceptance
A. Inventory current Ask Geomacro routes/components, signing and x402 handlers. Add contract tests before modifying routes.
B. Build conversational UI adapter and bounded session context over existing query handler. Test follow-ups and mobile/keyboard behavior.
C. Add machine adapter reusing same verified result and schema, no duplicate reasoning pipeline. Validate schema and external signature verification.
D. Integrate no-funds commercial preflight; assert no charge on insufficient coverage, stale evidence or runtime failure.
E. Regression tests: existing 3 categories, source-free projection, original evidence clocks, canonical edge vectors, legacy website paths, GRI/GRO and x402 idempotency.
F. Only after #2124 verified current state, run exact-main production health, three-category independent questions, external verification, and production deployment acceptance.
G. Owner ACK separately required for any real-money settlement.

No production-ready or revenue claim until these checks actually pass.
