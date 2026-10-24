# Geomacro: permanent zero-paid Telegram-independent intelligence inputs

## Technical and rights decision (24 October 2026)

Automated collection of arbitrary Telegram public-channel posts for AI-assisted
commercial aggregation is **not** a free source entitlement. A public channel,
normal Telegram account, free Telegram API key, and changes to the wording of
a post do not provide Telegram's platform rights or the author's publishing
rights. The 152 candidate Telegram handles are NOT production licensed
sources. **Do not** activate MTProto session scraping, website `t.me/s`
mirrors, unofficial clones, or automated channel indexing as a rights
workaround.

Current primary sources already in Geomacro:
- GDELT 2.0 original GDELT *released event dataset* has reviewed commercial
  reuse (per `scripts/commercial-source-rights-evidence.mjs`), credited
  dataset source ID `gdelt_v2_events`, 15-minute GDELT releases.
- First-party UN/EU Council/Fed/BLS/BIS/WTO/ECB/GOV.UK/NRCan/DOE/USGS/etc
  official readers for geopolitics, macro and critical minerals.
- Current World Bank WDI source=2 and USGS published reference datasets have
  dataset-specific reviewed rights. They are periodic structural data, not
  breaking news or a publisher's article original publication timestamp.

## Durable no-card automated addition

The *existing* protected `Free Commercial Source Lineup No-Funds Rotation`
workflow runs `17,47 * * * *` and the existing D1
`free_source_production_updates_v2` hash-only checkpoints. It now polls
**exactly one small no-key GDELT manifest GET per 30-minute due slot** from:
`https://data.gdeltproject.org/gdeltv2/lastupdate.txt`.

The GDELT source publishes three pinned 15-minute release batch file
identities (Event, Mentions, GKG); the manifest's ZIP links happen to be
`http://`, but the observer **NEVER follows or fetches these URLs**. The
bounded parser verifies all 3 same timestamp, exact trusted GDELT filenames,
15-minute cadence, source URL host, archive size and checksum shapes. It
records **one SHA256 hash-only batch fingerprint** into existing geopolitical
D1 source update metadata. A stale or future batch may be observed but is
never declared current. No new account, payment, card, repo secret, cron, B2
object, server or always-on laptop is required. Zero raw articles are stored,
and no Telegram data enters this path.

The existing on-demand issuer resolver and GDELT DOC / GKG adapters continue
to search 195 countries with 3-category terms. The indexed batch indicator is
an additional cheap publisher-independent **discovery checkpoint**, not an
original story verifier. An article highlighted by GDELT requires a
first-party publisher page readback, country/topic evidence, corroboration,
source-specific reuse rights and separately authorized signing. GDELT's
commercial dataset rights do **not** grant rights to third-party article
text, image or publisher-owned media. An indexed original can still be
stale, a false association or lack sufficient evidence.

## Strict production acceptance

After merge, review the *protected main* workflow
`Free Commercial Source Lineup No-Funds Rotation`, job
`read-only-production-mesh`. It must actually show D1
`d1_exact_metadata_readback_verified=true` and GDELT
`gdelt_events: TRANSPORT_READABLE` in a sanitized source-outcome receipt.
If upstream is unreachable, stale, rate-limited or fails structure checks,
its source reader must remain degraded. Do not relabel a normal green CI
job as an upstream readback.

The offline test requires GDELT manifest 3-file issuer integrity with
negative spoof, missing/duplicate, expired/future batch and file/URL tests.
It also asserts no Telegram scraper or additional cron introduced.

The continuation remains:
1. Free official/GDELT metadata discovers possible original publisher events.
2. Check exact original issuer URL, native publication clock, news context,
   legal source-specific commercial use and independent same-event evidence.
3. Obtain actual Pallab Facts/Rights and Suman independent numerical GRI
   approval where relevant; standing governance consent is NOT a signed
   individual input or country-category certificate.
4. Write/read back immutable current B2 objects under D1 quota governor,
   promote D1 hot Intelligence/GRI/Risk Indices, compare deployed SHA, and
   accept strict deep-health HTTP 200 and a no-funds x402 deliverable.
5. Leave quiet country/category cells truthful NO_CURRENT_EVIDENCE and don't
   manufacture fake 195x3 "current news".

Sources:
- https://telegram.org/tos/content-licensing
- https://telegram.org/tos/bot-developers
- https://gdeltproject.org/about.html
- https://gdeltproject.org/data.html
- https://data.gdeltproject.org/gdeltv2/lastupdate.txt

## Separate owner export decision (25 Oct 2026)

The above no-public-channel-harvesting and 152-candidate-not-licensed
statements are unchanged. A manual owner-provided Telegram Desktop JSON
export is processed solely from a protected private B2 source; there is
no Telegram API/MTProto/t.me fetch. This creates unverified derived-only
research JSON, not a verified licence or a signed/paid product.
See `docs/adr/ADR-TELEGRAM-DERIVED-COMMERCIAL-USE.md`.
