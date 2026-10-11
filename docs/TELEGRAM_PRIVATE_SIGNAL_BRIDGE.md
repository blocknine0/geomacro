# Private Telegram signal bridge

Producer: `blocknine0/geomacro-telegram-signals`

Consumer/authority: `blocknine0/geomacro`

The producer emits only `geomacro.telegram-lead-envelope.v2` compact lead envelopes. Main verifies the envelope before any database ingestion. The verifier deliberately strips raw payloads and forces `UNVERIFIED` semantics.

Durable object content belongs in B2. D1 stores only compact checkpoint/index state and B2 object pointers/hashes. Supabase is not part of the cross-repository transport contract.

The generic `telegram_authorized_publisher_feed` source remains disabled unless at least one channel has current explicit publisher authorization evidence and is manually approved/enabled. Even then, the generic source remains non-commercial; downstream promotion requires normal Geomacro corroboration, rights, provenance, freshness and scoring gates.


## Long-term protocol acceptance

Main does not require a new producer-commit repin for discovery, registry, CI, or implementation-only changes.
Acceptance is fail-closed on:

- producer repository: `blocknine0/geomacro-telegram-signals`
- payload schema: `geomacro.telegram-lead-envelope.v2`
- protocol contract SHA-256: `6da33ed2a966d58122039ba38d83e801476a6318bc89634d0b3d951e8ad017c9`
- UNVERIFIED / non-scoring / non-commercial invariants

The recorded producer commit remains audit metadata only. Any schema or protocol-hash change requires an explicit main-repository review and migration.


## Optional request-time Telegram research fallback (2026-10-12)

On the `live_on_demand` x402 discovery branch, the canonical request first searches the existing official source mesh. If it finds no private first-party original article candidate for the requested country and mapped Geopolitics/Macro/Critical Minerals categories, `lookupTelegramFallback` may query a private operator-managed HTTPS reader. The main service supplies only ISO3/category/bounded limits, never the customer's question, source body, identity, payment header or wallet. The separate producer implementation is `blocknine0/geomacro-telegram-signals/scripts/serve_authorized_on_demand_research.py`.

The private reader requires active source-specific publisher/Telegram permissions, runtime API session and token. It returns only the strict `geomacro.private-telegram-query-receipt.v1` counts-only contract; no raw content, links, source identity or verified event enters the paid response. When no secret/reader exists, the status is `NOT_CONFIGURED` and nothing is fetched. Missing/failed/invalid reader replies remain `UNAVAILABLE` without changing `payment_required_now:false`, signing, scoring or x402 settlement.

This is a genuine optional **research lead lookup**, not automatically qualified fresh intelligence. Full live acceptance additionally requires operator-provided private HTTPS ingress, independently verified platform/publisher rights for selected ACTIVE sources, then a real live reader trace and separate official corroboration/signature acceptance. No 152-channel unrestricted activation, fresh GRO or payment is implied by a merged PR.
