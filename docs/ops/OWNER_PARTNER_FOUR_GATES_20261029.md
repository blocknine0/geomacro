# GeoMacro owner-only partner evidence gates (29 October 2026)

No PREDGE code, authenticated route, token, quota, 90-day pilot, external Risk Gate, deployments, commercial rights or payment rules are changed. No private partner correspondence, item IDs or source contents are committed.

## A. Historical cohort reconciliation

The attributed D1 feed retains a rolling 72-hour journal. A historical aggregate and a different-time public/source-neutral aggregate cannot be compared as if they were the same exact data cohort. Exact reconciliation requires complete owner-held older and newer exports with their timestamps, projection, categories and native ID sets.

Run locally on a secured owner machine:

    node scripts/ops/verify-owner-partner-four-gates.mjs /private/current.json /private/old.json

It compares same-projection stable native IDs and category counts, flags identity contradictions and reports per-category entered/left/kept, potential TTL-age-out and status changes. A count-only historical baseline returns explicit INCONCLUSIVE; omitted older file produces BASELINE_WITH_NATIVE_IDS_NOT_AVAILABLE. Neither disappearing item nor status change is proof of lost partner delivery. Current source archive/canonical D1/partner parity remains handled by the pre-existing one-shot live verifier.

## B. Attribution and unverified OSINT

The offline owner audit counts credited and uncredited items and distinguishes monitored OSINT, dated official candidates and official observed unscored releases. It rejects any research item promoted to payable, signed or established numerical impacts.

No credit field does not automatically prove a violation; inspect the originating source's individual attribution and licensing obligations privately. Monitored OSINT remains unverified until actual independent first-party originals, native publication clocks, genuine topical/country corroboration, distinct trusted fact and rights authority approval and source-specific commercial rights exist. Do not bulk upgrade statuses to satisfy customer acceptance.

## C. Fifty per category

The preview capacity is min(50, actual current category count). 50 received advisory news IDs are not 50 signed objects. GRO 1.1 signs qualifying country/corridor/event risk objects, not every research news ID. This tool never signs research, reports signed 50/category readiness as false, and does not accept an expired test-only Ed25519 vector as genuine commercial evidence.

A real production signed preview needs current verified sources, independent rights proof, actual production Ed25519 trust root, genuine GRO, exact B2/D1 readback and separate authorized Risk Gate credentials. It may not be substituted with newly named hashes or derived article summaries.

## D. Risk Gate news-context compatibility

The current strict Risk Gate v1 response does not contain a news_context field. Injecting one unilaterally could break the partner's validator. This tool builds and validates a separate owner-only draft geomacro.news-context.draft.v1 document with up to 50 CURRENT research IDs in each of the three categories. It explicitly requires research_only true, signed_news false, execution_authorized false, retention_hours 72, partner_validator_approved false and commercial_rights_verified false. Unknown IDs, incorrect categories, duplicate IDs and caps above 50 are rejected.

A future new versioned contract requires explicit buyer/partner schema and signer-spec agreement, exact bytes covered by signature, key rotation and attribution treatment. No existing risk-gate-1.0 endpoint, PREDGE validator or production credential is changed by this PR.

## Exit criteria

1. Recover genuine older same-projection native ID set before claiming exact historical reconciliation. If unavailable, leave historical discrepancy unresolved.
2. Independently establish each news item's source credit obligation and evidence qualification, not blanket verification.
3. Obtain written partner agreement for proposed news_context version and its signing scope before activation.
4. Verify a real current commercial GRO, B2/D1 readback, Risk Gate and source rights before promising signed 50/category.
5. Only then discuss separately authorized paid B2B and USDC delivery. No free research feed charging.

All CI cases use synthetic news. The owner audit runs offline: 0 partner calls, 0 D1 reads, 0 source requests, 0 USDC payments.
