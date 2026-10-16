# Geomacro final-plan contract recovery — 2026-10-17

Scope: founder-supplied 13-JSON artifact ZIP. **Founder overrides ZIP draft pricing. ALL prices stay in existing canonical geomacro.capability-usdc.v1 schedule.** Never promote ZIP examples or invalid SAMPLE_SIGNATURE_NOT_VALID to real events or paid signatures. No funds. Supabase remains frozen.

## Existing founder-locked canonical USDC pricing

| Capability | Variant prices |
| --- | --- |
| gri_read | verified_cached 0.005, verified_change_attribution 0.01 |
| structural_country_digest | standard 0.02 |
| structural_corridor_digest | standard 0.05 |
| structural_country_profile | standard 0.03 |
| structural_corridor_profile | standard 0.08 |
| intelligence_query | focused 0.05, standard 0.10, complex_multi_source 0.15 |
| signed_risk_object | existing_valid_signed 0.05, newly_qualified_signed 0.10 |
| risk_gate_bundle | existing_proof_preflight 0.10, standard 0.15, complex_multi_source 0.25 |

Canonical source of truth remains src/lib/capability-pricing-catalog.ts (unchanged). Last two capability families were already in the catalog; this plan invents no additional variants. ZIP 365-day wallet price lock and 25 free trial credits are NOT enabled without identity, abuse/quota, durable ledger and expiry proofs; proposed partial-charge-on-PARTIAL is NOT enabled.

## Implemented as a scoped proposal (merge/live still gated)

1. src/contracts/schemas/v1/nocharge.json: exact eight-capability billing-negative receipt, five reasons.
2. src/lib/geomacro-nocharge.ts: immutable redacted no-charge response; refuses post-payment conversion, customer-supplied pricing, source URL/identity, unsupported subjects; unchanged ETag matches only a separately verified current content hash.
3. Canonical Coinbase intelligence POST: existing pre-payment 422 failure stays uncharged, keeps old error/availability properties, and now includes a versioned no_charge receipt. No challenge, signing or payment is authorized by this extra field.
4. src/contracts/schemas/v1/delivery.json + src/lib/geomacro-delivery-v1.ts: paid V1 shape and STRICT read-only validator (canonical price, original freshness, public privacy, separate actual lawful rights/current evidence proof, real Ed25519 JCS content verification proof, durable settled-payment proof). Not a new signer, publisher, payment handler or trusted positive.
5. Focused tests: variant parity, no-charge ETag/retry, consumer safety and denial of synthetic/stale/unqualified/unsettled paid envelope. Existing frozen commercial rights remain enforced.

## Exact remaining production acceptance sequence

1. **Current SHA / hosted 503 and D1 security:** merged exact SHA, protected CI/CodeQL, D1 worker authenticated budget and actual public website Worker routing after Lovable publication. Verify safe free GET and no-charge POST. Do not accept a static build marker as running SSR proof.
2. **195x3 fresh original coverage:** local, regional and official global sources; truthful missing status for 585 cells, native publication clocks, original URLs privately validated, bounded no-auth-bypass fallback; source transports and free Finds are not current commercial GRO.
3. **Real dual source authority:** two separately authored originals for the SAME country/category event, publisher-native timestamp, semantic matching, contradiction/retraction, actual no-public-attribution commercial derived-use license; local offline protected facts and rights keys pinned and separate from GRO issuer.
4. **Current signed GRO:** real independently verified facts/rights attestations and pinned GRO Ed25519 exact bytes. Read back immutable B2 SHA through account-wide quota and D1 provenance/current snapshot. Do not confuse Geomacro owner-operated automated trust with Federico independent reviewer.
5. **Three legacy hot products:** Intelligence, GRI v1.2 and Risk Indices; true signed current state from qualified evidence and historical continuity; do not promote recovered October 8 historical baseline or free Findings into current scores. Strict deep-health 200 requires live proof.
6. **Official API / AI Agent:** complete or safely supersede open PR #2344 and verify single canonical engine, OpenAPI, MCP/A2A, 195-country routing vs actual evidence honesty. No separate paid engine, no invented live response.
7. **Actual signed delivery V1:** connect verifier to canonical signer/quote/ledger; write and test an explicit JCS-RFC8785 adapter if used in V1, never pretend legacy GRO canonicalization is identical; eight capability response contracts, compact/full derived-only projections, tamper/expiry/attribution validation. ZIP sample signatures must always fail.
8. **Unchanged free on authenticated hash:** when actually verified current prepared artifact exists, verify exact same paid subject, price variant, rights/expiry, signer key and hash BEFORE quote. ETag from user alone cannot confer commercial rights or unlock free content. Helper is not yet universal checkout integration.
9. **x402 no-funds plus funds gate:** review existing #2242 cross-provider prequote, preserve canonical locked amounts, DO replay and once-only settlement, negative path no-charge. Explicit owner real-money ACK separately before first payment.
10. **PREDGE October 19 / Federico:** partner isolated Worker/D1, signed real sandbox receipt, market/key/TTL/replay proof, 100/day default and 500/day hard cap. Federico strict independent reviewer and external /review acceptance are separate; no partner money spent.
11. **Quota/governance and website:** 30-minute bounded intake, 15-minute free Finds site embargo, D1/B2/Class-B/Actions budgets measured under real 24/7 run, backup degraded truth, protected consumer privacy/history, no frozen Supabase writes.
12. **Close only with receipts:** original issue checklists get verified merged SHA, live run IDs and exact timestamp, real signed response, protected no-funds negative tests and partner acknowledgment. Code merge alone never qualifies for closure.

State vocabulary: IMPLEMENTED (code), CI_VERIFIED (checks), MERGED, DEPLOYED_VERIFIED (matching actual live instance), PAID_READY (all authentic product gates plus no-funds), LAUNCHED (explicitly authorized real USDC receipt).
