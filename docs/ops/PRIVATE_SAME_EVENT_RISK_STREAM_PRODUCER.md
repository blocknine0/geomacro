# Private same-event Risk Stream candidate producer

The feed-side entry point is scripts/ops/push-risk-stream-jsonl.mjs. It accepts
ordinary geomacro.risk-stream-candidate.v1 JSONL as before, and now also
accepts one line per geomacro.private-independent-event-source-candidate.v1
record from a trusted private source transformer.

Each private record uses the existing candidate contract from
clusterPrivateIndependentEventCandidates plus a risk_stream object containing:
feed_origin, source_id, publisher_root_domain, parent_media_entity, source_role,
derived (what/why/market/watch), raw_payload and proof
(facts_signature_b64/rights_signature_b64). The existing private record fields
still provide category, exact event identity, same_event_claim_sha256,
first-party URL and publisher identity, source-native publication time,
original article SHA, reporting position, anti-syndication checks and private
status. Input must be the exact bounded private article bytes; the SHA must
match raw_payload.

The producer reuses sameEventClaimHash and the repository's canonical
250-entity geography classification. It does not hash headlines or invent
event equivalence. It emits a pair only when the exact structured claim
matches, both articles and publication proofs are distinct, the publishers are
registered and independent, the category role pair is complete, publication
clocks are no more than 90 minutes apart, and no same-event candidate disputes
or retracts the report. Any correction or retraction blocks the whole claim.

It derives one deterministic event_key, sorted event entities and
event_fingerprint from the canonical same-event claim, then attaches those
same values to both source records. The existing Worker still verifies the
Ed25519 Facts/Rights signatures against its exact claims, source registry,
rights expiry, original bytes, clocks, role pair and queue bounds before
acceptance. The producer never creates signatures or marks rights approved.

The action receipt reports aggregate counts only. Private URLs, article bytes,
publisher names, event identities and signature contents are never logged.
Input must be piped directly to the authenticated internal adapter and must
not be captured in public Actions logs or artifacts.

All outputs continue through the unsigned news-analysis Risk Gate:
news_analysis_only=true, no customer delivery, no commercial sale, no
execution authority, and zero payment. An accepted original pair may support
a separate internal signed GRO only after the Worker's existing independent
proof checks; that still does not release a commercial hold or authorize
billing.
