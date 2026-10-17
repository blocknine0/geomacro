# Durable website-only 60-minute verified GRI history — 12 October 2026

## Solved software gap

Previously website GRI could select a genuinely verified historic snapshot
only from quota-frozen Supabase, or fall back to the **latest** B2 package
if it was already older than 60min. After a new B2 snapshot arrives, both
routes can fail even when a valid previous verified snapshot exists.

Use the **existing** Cloudflare control-plane D1 and existing verified
B2 production hot snapshot admission—no new host, account or schedule:

1. Commit migration 0015. Private table
   `website_verified_gri_snapshot_history` retains exact original public
   verified GRI payload JSON + SHA-256 / B2 digest and original snapshot
   timestamps, at most 12 original entries over 30 days (D1 enforced).
2. Only `direct-b2-readback` ORIGINAL verified GRI snapshot PUTs (already
   validated for exact live key, digest, full B2 readback/gzip restore and
   existing D1 payload SHA-256) enter history. Independent current risk
   overlays atop old B2 baseline are excluded from historical archive.
   Atomic D1 batch persists current hot snapshot plus immutable ring entry,
   plus prunes old history. No raw news inputs, Telegram posts, B2 fetch
   or Supabase write introduced here.
3. A new WEBSITE-ONLY public GET
   `/v1/public/website-lagged-global-risk` selects latest originally
   verified historic GRI with real `snapshotAsOf <= now-60min`. It
   independently recomputes the exact stored D1 payload SHA-256, rechecks
   original GRI identity/proof clocks and refuses future or corrupted rows.
   The response is sanitized: no original event rows, publisher titles,
   URLs, original news, provider IDs, or domain topEvent headlines.
   It explicitly states **past B2 readback verified at write time**,
   **not rechecked on today's read**, chargeable=false.
4. Website server prefers this strict D1 history with bounded GET (3.5s),
   validates the original hash-bound signed/verified GRI continuity,
   and falls back to existing frozen-Supabase old history and latest B2
   only if their timestamps are genuinely beyond 60 minutes.
   Machine APIs and paid x402 remain unchanged, live and unlagged.

## Safeguards and honest limits

- D1 historical ring adds at most one history insert + one bounded pruning
  operation per already verified GRI hot PUT. No new recurring poll
  or uncontrolled B2 requests. Keep 12 entries max and 30d.
- An empty history stays 503 until a **new genuine direct B2 verified
  GRI artifact** passes existing producer admission and the production
  Cloudflare D1 migration/deploy completes. This cannot resurrect records
  that have never been written to B2 or verified.
- A 60m embargo is a **minimum release threshold**, not a guarantee
  exactly one hour of lag if upstream scoring/recovery itself is stale.
- Do not claim D1 history production-ready until main deploy workflow
  successfully applies migration 0015 and real endpoint returns a
  verified nonempty source-private response. A 503 empty but correctly
  proof-bound is expected when upstream has no such history.
- The user's **updated pricing** and explicit live real-money ACK are
  still pending. Machine x402 checks do not inherit this delay.

See #1827 and #2103.
