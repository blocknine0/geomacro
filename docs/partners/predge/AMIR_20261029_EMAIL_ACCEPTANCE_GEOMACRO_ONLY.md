# Amir 29 October 2026: GeoMacro-only remediation and evidence

This document is a technical handoff, not proof of a paid or signed live product. It does not change PREDGE code, tokens, quota, driver, schema, contract, workflows, deployments, or the free research pilot.

## 1. 353 versus 507

The old GeoMacro totals reported to the partner were geopolitics 183, macro 133, rare_earth 37 (353). The partner's two reads around 13:05 UTC on 29 October returned geopolitics 183, macro 219, rare_earth 105 (507): category differences 0, +86, +68. The source date, endpoint, filters, and exact IDs of the *older 353* are not established by this report. Therefore the gap of 154 is not independently explained. Do not assert that these are missing records, duplicate records or purely attribution differences until the same cohort and projected scope are compared.

The authenticated PREDGE projection retains known mandatory source credits. Public source-neutral responses omit credited records. PREDGE counted 499 credited of 507; only eight uncredited remain on that snapshot. Thus a hypothetical SAME-COHORT public source-neutral projection could not contain 353 of these same partner items; an old Website subset must be treated as a different cohort/view until the 353 original ID set is recovered.

scripts/ops/audit-predge-29oct-email.mjs provides an owner-only, bounded, read-only audit. With --live, it consumes one existing protected authenticated GET plus one public GET, prints no item IDs, publisher materials, URLs or bearer, and shows category, source-credit, confidence-state counts plus hashed IDs and exact same-cohort subset status. With --offline it processes local privately held JSON exports and uses zero quota. If the clocks differ by more than 90 seconds or old 353 source IDs are unknown, the result is INCONCLUSIVE rather than claimed PASS. For exact archive->D1->partner parity use the existing verified one-shot D1/archive verifier separately.

## 2. Fifty IDs per category and the signed-flow request

The recipient's driver reportedly carries up to 50 research IDs for each category. Research items remain unsigned and advisory. The current live risk-gate-1.0 response contract in src/lib/risk-gate-contract.ts has NO news_context field. The current PREDGE Risk Gate Worker response carries a risk_gate decision plus a separate context object, not a 150-ID signed research overlay. Its strict validator rejects unknown response keys.

Adding risk_gate.news_context silently to risk-gate-1.0 would break current consumer parity. Before deployment, both parties must approve a versioned additive response contract and an upgraded recipient validator. A *proposed future* nested risk_gate.news_context could carry schema geomacro.news-context.v1, retention_hours 72, and geopolitics/macro/rare_earth lists with up to 50 eligible source-native IDs each, original release clocks and mandatory source credits. The context must explicitly distinguish research_only=true and signed_news=false unless the exact context bytes themselves have been independently signed and verified. A signed GRO alongside news ID references does NOT cryptographically sign those references.

No REAL production signed preview can be claimed from unsiged 72-hour research. Actual approval requires an active distinct protected Risk Gate token, current cryptographically valid production gro-1.1, genuine corroborated evidence, licensing/rights and exact B2/D1 acceptance. The existing TEST-ONLY Ed25519 vector is expired and not production trusted; it may be shared solely as a parser test vector with a prominent TEST ONLY label. PREDGE must revise its validator itself if the new news_context is mutually accepted. Never modify PREDGE or release its Risk Gate bearer prematurely.

## 3. Attribution and OSINT confidence

Amir reports attribution present in 499/507 records. The other eight have no source credit in the response, but that does not prove a legal attribution defect. Verify originating source and whether it requires a notice before changing allowlists or claiming compliance. 475/507 are classified unverified OSINT observations. Preserve that status; original publisher and native time, topic relevance, independent corroboration and commercial permissions must be checked before individual qualifications. A HTTP 200, source signature or driver acceptance does not make those verified or payable.

## Evidence and release gate

1. Offline synthetic tests pass without partner data or secrets.
2. The protected one-shot main-branch audit performs ONE authenticated GET + ONE public GET and produces aggregate-only receipt; HTTP 429/503 is a truthful failed acceptance, not success.
3. Compare same-cohort exact ID digests; old 353 remains unverified without its original IDs, time and filters.
4. Only generate and send a real signed-flow response after independent current GRO/rights/credential readiness; no manufactured item scoring, no unauthorized partner schema edit.
5. Send the partner the safe receipt, precise scope/clock and proposed compatibility note; no commercial claim.

Source contracts: docs/partners/predge/PREDGE_20261020_INTEGRATION_CONTRACT.md, src/lib/risk-gate-contract.ts, workers/control-plane/src/predge-risk-gate-d1.mjs, docs/ops/WEBSITE_PREDGE_SHARED_NEWS_72H_RECOVERY_20261029.md.
