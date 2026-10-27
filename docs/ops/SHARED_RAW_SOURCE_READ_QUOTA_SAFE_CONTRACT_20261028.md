# GeoMacro shared source data reads across storage quotas (2026-10-28)

## Source of truth — no conflicting raw-data copies

**One registered HTTPS RSS/Atom source fetch per endpoint per collector tick**, not one download per category or per downstream storage. In the private 195-country collector, all three domains (geopolitics, macro, rare_earth) classify the **same ephemeral publisher-native RSS/Atom payload** with original publication clocks. The complete raw publisher feed, original article URLs, titles, and article bodies remain *in memory only* in the private intake pipeline and are **not** copied to D1, GitHub artifacts, public R2, or KV.

For every accepted private **source-neutral fact observation**, compute one sorted, deterministic SHA-256 manifest over canonical item JSON, immutable item IDs, native dates and three-domain labels. This manifest deliberately identifies the transformed safe observations, **not raw publisher bytes**. That exact internal manifest is sealed inside existing AES-256-GCM temporary GitHub quota-held backlog. When the D1 quota admits work, both direct D1 writes and independently verified encrypted replay compute this same identifier without a new D1 SELECT, publisher re-fetch, B2 call, R2 PUT or KV mutation. Backlog replay refuses deletion if the D1 writer reports a different content hash, an incomplete readback or any capacity exclusion.

**Service boundaries**

| Service | Same-source use | Hard boundary |
|---|---|---|
| Private collector memory | One ephemeral **raw feed** read, shared across three categories | Raw publisher titles and full source XML are NOT persisted; malformed/denied sources stay unverified |
| Cloudflare D1 | 25h source-neutral records + exact writes and independent readback | Only canonical store; exceeding provider D1 rows-read quota halts new canonical SQL |
| Encrypted GitHub Actions | Up to 25h eligible facts from the **same** normalized source records and category ID SHA256, sealed | Short retention, no plaintext, not D1-verified, source titles/URLs absent |
| Backblaze B2 | Existing governed *private* immutable raw/derived evidence bundles (separate source collection paths) | Access still subject to B2 shared D1 atomic quota reservation; no automatic D1 bypass or RAW-to-public fanout |
| Cloudflare R2 | Existing SHA-checked public source-neutral derived snapshots, already projected from D1 | Not the raw original; never use for authenticated PREDGE, signed, private or paid readback |
| Cloudflare KV | Optional pointer/checkpoint, NOT original news content | Does not claim canonical durability or new data |

The fact that these services have separate free-tier quotas does **not** let them call SQL or read B2 when their own provider permissions or shared atomic D1 reservation are unavailable. No magic promise of 195×3 dated events or uninterrupted source publication.

## Acceptance and tests

- The new `private-osint-shared-read-contract.test.mjs` verifies **one raw HTTPS RSS GET** with exactly three native-clock category projections, no second download, source-neutral digest and no public raw publisher bytes.
- GitHub encryption tests prove that ciphertext includes the exact shared manifest and that old pre-manifest artifacts remain recoverable.
- Production protected D1 receipt now contains **`shared_source_read_content_sha256`** and matching category counters, without changing the existing D1 Worker, table, readback API or public news.
- Encrypted backlog deletion requires the D1 writer to acknowledge the **same** content SHA and verified readback.
- PREDGE and its integrations, historical repository/Supabase, pricing, signatures, commercial authorization, B2 quota governor and customer API contracts are unchanged.

**What this does not do:** It does not create a central raw publisher article warehouse readable by each storage vendor. That would require an explicitly provisioned **private** object store, reviewed read capabilities, retention and independent quota permission; wiring raw private feeds directly into public R2/KV would violate the existing privacy boundary. Current implementation is the narrow safe shared source-read consistency path, not a raw article redistribution system.

**Full acceptance** requires main CI, protected production D1 upgrade/reset and a successful exact canonical write/readback matching the encrypted backlog SHA. Until that run, cryptographic consistency is code-tested, not live D1 recovery.
