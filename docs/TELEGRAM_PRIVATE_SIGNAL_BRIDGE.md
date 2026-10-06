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
