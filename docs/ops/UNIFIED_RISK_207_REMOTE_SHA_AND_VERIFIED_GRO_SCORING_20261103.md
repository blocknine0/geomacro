# Unified Risk Gate production: genuine 207/207 remote integrity + current verified GRO scoring

## Problem

2026-11-03 production D1 census found **195 country + 12 corridor real immutable HMAC snapshots**. A separately observed private Supabase daily table was missing many canonical rows, including after the ordinary 12-per-five-minute background drain. A D1 `supabase_synced_at` flag alone cannot prove the row still exists in remote Supabase. The daily Gate also retains its original immutable HMAC snapshot even if a later real signed GRO is published; treating earlier unverified observations as signed numerical scores would be wrong.

## Strict integrity recovery (zero invented data)

The owner-only `POST /v1/internal/risk-gate/unified-reconcile-page` accepts exactly `{"page":0..17}`. It is located AFTER the existing authenticated control-plane admin guard; it cannot run with a public/partner/customer token. An indexed, stable ID-ordered D1 read loads exactly 12 canonical target snapshots (three on page 17), never TWN or another supplementary country. Each must match the **precise** expected canonical identity, UTC day, local SHA256 and the existing private HMAC signing key before any Supabase operation. A 404/missing target, malformed proof, stale day, mismatched HMAC or missing 3-category snapshot fails closed.

For each page, query Supabase for exact existing IDs/content SHA. Already-correct bytes are **read-only**. Only genuinely absent or SHA-divergent immutable records are upserted, followed by remote exact-ID/SHA readback; only then may D1 set `supabase_synced_at`. A forged SQL flag never substitutes for the remote read. Every page returns a finite metadata-only result (no originals/IDs/URL, user data, signing key, authorization header, object JSON, or payment). A final owner `GET /v1/internal/risk-gate/unified-census` independently validates **all 207 exact canonical identities and remote hashes** before an all-green integrity claim.

`scripts/ops/reconcile-unified-risk-207-production.mjs` is called after protected main deploy when the D1 census has all 207; it also runs in the **existing** daily 18:30 UTC acceptance workflow. It executes 18 sequential bounded pages, no large bulk network call. Missing D1 generation, remote 503, byte mismatch, incomplete set or network failure remains red. Extra retroactive repair of the previous 7 days is intentionally out of scope of this *current-day* exact census; seven-day rolling storage retention is unchanged.

## Real verified scoring (separate contract)

The only admissible real numerical score originates from a **currently valid, independent, archive-acknowledged `gro-1.1` Ed25519** object verified against the existing pinned Geomacro signing registry and its commercial eligibility and evidence/confidence constraints. The accepted GRO must contain verified attribution contributions for all **three** categories. Raw official publisher metadata, Private OSINT, GDELT, headline matching, Google's search fallback, a D1/B2 SHA or daily HMAC **cannot** produce numerical risk scores, commercial PASS/BLOCK or source rights.

The `POST /v1/risk-gate/unified/evaluate` private response now additionally computes **`verified_live_scoring`** from a freshly rechecked current signed GRO at query time, separate from the immutable daily HMAC observation:
- `CURRENT_SIGNED_GRO_UNAVAILABLE` => all category scores and unified score null.
- `CURRENT_SIGNED_GRO_THREE_CATEGORY_INCOMPLETE` => per-category verified contributions may exist; unified score null.
- `CURRENT_ED25519_VERIFIED_THREE_CATEGORY_SCORE` => all three contributions genuinely verified and the independently computed current score is present. Client-policy thresholds still require a separately approved policy and never authorize execution.

This response field explicitly says it is **not** part of the daily snapshot HMAC. Existing Predge, x402, entitlement and payment routes are unchanged. The owner-only census separately counts **candidate hot rows**, not cryptographically validated GRO: a nonzero candidate count never certifies a positive signed score.

### Outstanding immutable external prerequisite

The existing qualified machine GRO production workflow requires a **real current private B2 package** with first-party same-event source evidence, independent corroboration, separately pinned **Facts + Rights Ed25519 signatures**, and lawful commercial rights. It verifies the package, signs a qualified risk object with the approved production issuer, performs B2 full-byte GET and D1 readback. Without a qualified package, the platform must return `CURRENT_SIGNED_GRO_UNAVAILABLE`, not mint its own reviewer signature or call an unverified item zero risk. See `docs/ops/PERMANENT_QUALIFIED_SIGNED_GRO_PRODUCTION.md`.

## Evidence for acceptance

1. PR Product CI, CodeQL, existing Risk Gate and 207 daily census offline tests.
2. Additional 207 canonical page tests: page 0/17, read-only when SHA matches, repair only missing rows, SHA/HMAC tamper refusal, 503/red acceptance, 18-page owner script requiring **207/207 final remote hashes**.
3. Protected main deploy uses the genuine production Worker/D1 and secret, verifies three real canaries, then reconciles all 207 and reruns the authenticated daily census. No fake HTTP responses.
4. Independent private Supabase SQL: 195 unique canonical country plus 12 corridor records for today's UTC date (exclude supplementary TWN), and **207 exact matching D1 remote SHA** via protected Worker census. Never claim integrity from a row count alone.
5. Current verified GRO scoring stays visibly blocked until qualifying independently signed current evidence exists. Never report "fully verified scoring" from HMAC snapshots or the source feed alone.

No paid news providers, credentials rotation, PREDGE edits, automatic payment, or destructive migration is introduced.
