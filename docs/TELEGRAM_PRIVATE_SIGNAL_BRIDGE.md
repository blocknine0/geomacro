# Private Telegram signal bridge

Producer: `blocknine0/geomacro-telegram-signals`

Consumer/authority: `blocknine0/geomacro`

The producer emits only `geomacro.telegram-lead-envelope.v1` compact lead envelopes. Main verifies the envelope before any database ingestion. The verifier deliberately strips raw payloads and forces `UNVERIFIED` semantics.

Durable object content belongs in B2. D1 stores only compact checkpoint/index state and B2 object pointers/hashes. Supabase is not part of the cross-repository transport contract.

The generic `telegram_authorized_publisher_feed` source remains disabled unless at least one channel has current explicit publisher authorization evidence and is manually approved/enabled. Even then, the generic source remains non-commercial; downstream promotion requires normal Geomacro corroboration, rights, provenance, freshness and scoring gates.
