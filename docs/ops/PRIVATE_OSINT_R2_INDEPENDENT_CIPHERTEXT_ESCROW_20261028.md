# GeoMacro D1-exhausted continuity: private R2 escrow + existing GitHub backup

## One source read, three categories, separated quota pools

Main collector fetches each pinned native RSS/Atom endpoint **once per cycle** and classifies the same transient feed into Macro, Critical Minerals and Geopolitics/War. Publisher-original text, titles and links remain ephemeral in memory, never published to storage. The strictly validated source-neutral factual observations have one immutable SHA-256 identity.

- **D1:** only canonical database. Protect quota and write exact private 25h native-clock news only when account-wide admission permits. Green CI or an encrypted backup does not equal D1 delivery.
- **GitHub Actions:** currently working encrypted backlog (AES-256-GCM + gzip, 2-day artifact retention). Owner of source-free buffered observations during D1 HELD.
- **NEW OPTIONAL PRIVATE R2 BUCKET:** encrypted ciphertext mirror of the very same GitHub artifact, with exact SHA-256 content-addressed key; one SigV4 PUT and one independent GET+byte-hash verification per produced encrypted batch. No extra publisher fetch, D1 SQL, B2 atomic governor ticket, KV write, payment or signed payload. Prefix `geomacro/private-osint-held/v1/YYYY/MM/DD/SHA256.json` inside an **independent PRIVATE bucket** only.
- **Existing B2:** private governed original evidence archives under existing D1-backed quota governor. No B2 bypass or deduced free headroom.
- **Existing PUBLIC R2/KV:** source-neutral D1-backed public projections and optional cursor, not original/private OSINT objects. NEVER configure the private mirror to use the public R2 news bucket.
- **PREDGE:** unchanged.

## Operator-only R2 opt-in

No automatic bucket creation, spending, subscription or secret issuance. If a dedicated private R2 bucket and Cloudflare R2 S3 scoped token are available, configure the protected `production` GitHub environment:

1. `GEOMACRO_PRIVATE_OSINT_R2_BUCKET` — production **variable** with a new/existing privately governed R2 bucket name beginning `geomacro-private-osint-`. Public R2 bucket, `r2.dev` and custom public-domain access MUST be disabled. Limit lifecycle retention and monitor R2 operation quotas.
2. `GEOMACRO_PRIVATE_OSINT_R2_ACCESS_KEY_ID` — **secret**, restricted to this private bucket (and preferably the specific `geomacro/private-osint-held/v1/` prefix).
3. `GEOMACRO_PRIVATE_OSINT_R2_SECRET_ACCESS_KEY` — matching **secret**. Never put it into logs, issues or chat.
4. Existing `CLOUDFLARE_ACCOUNT_ID` and `GEOMACRO_COMMERCE_LEDGER_TOKEN` are reused in protected main. No new D1 token or global Worker deploy.

If the variable is absent, the new R2 step is skipped and existing GitHub backup continues. If configured but R2 times out, returns a quota/permission error or its readback differs, the stage is shown as FAILED with a warning but GitHub encrypted artifact upload is not suppressed.

## Source/proof constraints

The cryptographic key is derived exclusively from the existing private ledger token under `geomacro.osint-held-spool.aes256gcm.v1`, NOT a public R2 credential; mirrors never contain an original publisher title, article body, link, source-access key or commercial-rights claim in plaintext. Existing `unsealPrivateOsintSpool` validates AEAD, source-native 25h validity, ID/category byte identity and false commercial/verification flags before any private R2 PUT. R2 stores **only authenticated ciphertext** and immutable hash key. Logs contain only counted items, checksum and non-sensitive storage key.

Quota limitations remain real. R2 does not let a disabled D1 Free instance accept SQL after 5M rows read/day, does not turn 25h-expired news into a fresh canonical record, and does not guarantee every publisher generates a dated event. Existing GH spool replay remains canonical admission path and is deleted only on verified D1 readback with matching source hash and zero exclusions. R2 copy is independent evidence escrow, **not automatic B2/GitHub/D1 replacement**.

## Production acceptance

1. Deploy PR to main, verify code test and both quota-held workflow suites.
2. Check that 15m HELD job emits an AES-GCM GitHub artifact. If the private R2 variable has been configured, require a separate `geomacro.private-osint-r2-encrypted-escrow-receipt.v1` with `private_ciphertext_written_and_readback_verified:true`, no raw source bytes and no D1 SQL.
3. Recheck account-wide Cloudflare D1 Free read usage. Only after reset or operator-paid verified headroom should normal protected D1 writes and encrypted GitHub replay succeed.
4. Require actual canonical 3-category readback, same observed input hash and 195×3 evidence freshness report; source health is never a substitute for event coverage.
5. Keep P0 master #1827 open until multi-day production acceptance. Independent raw publisher archive access still depends on its separate B2 rights, origin and quota governance.

The private R2 mirror protects against losing source-neutral evidence if GitHub artifact storage becomes unavailable. It does NOT guarantee zero permanent data loss if *both* stores fail, publisher endpoints fail or cloud quotas are exhausted simultaneously.
