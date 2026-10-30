# GeoMacro free-first three-category news ingestion budget — 30 October 2026

**Scope:** GeoMacro only, Geopolitics, Macro/FX, Critical Minerals and the 195-geography collector. PREDGE, historical repo/Supabase, source rights, x402, payments, canonical D1 and governed B2 unchanged.

## Official included limits

| Provider | Included free usage | Guard |
|---|---|---|
| Cloudflare D1 Workers Free | 5,000,000 rows read/day; 100,000 rows written/day; 5 GB total database storage; max 500 MB per individual database | Existing provider-measured account-wide reserve and current 3–5-row-per-tick source-only admission |
| Cloudflare R2 Standard | 10 GB-month stored; 1 million Class A and 10 million Class B operations/month **account-wide** | Existing optional dedicated PRIVATE encrypted escrow only; verified 48h prefix expiry and <=1.5 MB per object |
| Backblaze B2 | First 10 GB stored free | Keep existing private original archive, D1 atomic B2 quota reservation and actual PUT + two GETs + hash + D1 ACK |
| GitHub Actions | Existing 2-day encrypted artifacts | Short-lived fallback, NOT canonical D1, permanent B2 or unlimited free storage |

R2 Infrequent Access does not receive the Standard free allocation. R2 requires an activated subscription; this code never creates one or enables automatic spending. Any other usage in the same Cloudflare/Backblaze account consumes the same free allowances.

## Existing one-sweep/no-duplicate flow

1. Existing pinned collectors read each reachable source feed once per sweep, preserving the source-native clock. HTTP 403/429 remains an access denial and is never bypassed.
2. Existing Phase 2I single-sweep original index deduplicates publication permalink + original clock across overlapping feeds, discards exact repeats, quarantines contradictory original titles and projects only topic-relevant category records.
3. D1 is the ONLY canonical original-news store: accept provider-governed 3–5 rows, verify independent D1 readback. Not all in-memory candidates are stored. A candidate count is not an archive receipt.
4. On true D1 quota HOLD, an existing AES-GCM+gzip fallback stores up to 768 private source-neutral item observations in a 2-day GitHub Actions artifact. This is NOT a full legal-copy publisher archive.
5. An optional dedicated private R2 Standard bucket mirrors the same encrypted ciphertext, with one PUT plus one exact SHA independent GET. A new read-only lifecycle preflight must first confirm an **enabled delete rule of <=172,800 seconds (48 hours)** covering prefix geomacro/private-osint-held/v1/. There is no mutation to provider lifecycle settings.
6. R2 escrow ciphertext envelopes exceeding 1,500,000 bytes are **not mirrored**. The existing GitHub encrypted artifact still remains. The code cannot silently consume larger optional R2 allocations.
7. Cloudflare can delete expired R2 objects roughly 24 hours after expiry. With a conditional 120 writes/day at 1.5 MB, 3-day resident bytes would total about 540 MB, excluding unrelated usage, stale objects and delays. This bound is NOT a live provider bill or a zero-charge guarantee.
8. Restore remains the existing governed 25-hour original-clock D1 replay. B2 still requires separate provider quota and 2-GET archive proof. The short-lived R2 mirror is not a permanent primary database.

## Required private R2 operator setup

If enabling optional escrow, use a PRIVATE R2 Standard bucket named geomacro-private-osint-..., and disable public access. Set a **48-hour Object Lifecycle Rule** for geomacro/private-osint-held/v1/ in Cloudflare R2 Settings. Provide restricted R2 S3 read/write credentials through the existing protected GitHub production secrets and the bucket-name variable. The new read-only preflight uses the existing CLOUDFLARE_API_TOKEN with permission to read the R2 bucket lifecycle.

No bucket is created by the patch; existence/configuration of private R2 credentials and actual lifecycle are **NOT VERIFIED** until a protected production job proves it. If they are absent or insufficient, mirror PUT is blocked without suppressing the encrypted GitHub fallback.

## Required production proof

- Offline privacy, retention, capped-size and provider-rule tests pass.
- Actual protected-main HELD run shows R2 read-only lifecycle validation, encrypted PUT, independent GET and exact byte SHA. Without this evidence R2 = PENDING.
- Actual current-main D1 run shows selected, newly inserted, unchanged and independent readback per three categories.
- The actual provider account-wide usage for D1, R2 and B2 stays inside *all* included limits, with reserve for other workflows. No unlimited-storage, guaranteed-uptime, all-articles, 195x3 verified-event, raw full-text licensing or guaranteed $0 invoice claim.
- Keep unresolved provider/source/backlog/storage gaps tracked at https://github.com/blocknine0/geomacro/issues/3194.

Official references: https://developers.cloudflare.com/d1/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/limits/ ; https://developers.cloudflare.com/r2/pricing/ ; https://developers.cloudflare.com/r2/buckets/object-lifecycles/ ; https://www.backblaze.com/cloud-storage/pricing
