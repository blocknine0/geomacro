# Geomacro 3-domain Intelligence: D1 live news + governed B2 READ/WRITE backup

## Owner-approved topology

**One event, one native release clock, one canonical owned-derived signal**.
Existing protected hourly issuer crawler plus the 5-minute original fastlane
serve the **SAME** 72-hour Cloudflare D1 `website_derived_intelligence` journal.
Website `Intelligence` 3-category toggles, free API
`/api/v1/intelligence/query?view=auto-ingest-72h`, and bounded
machine/Predge research projections read the **same D1 IDs**. Do not create
a second news database or rescrape original publisher articles for a backup.

The new backup step, after independent public D1 journal readback:

```text
Official original → Geomacro-derived actor/action, category, timestamp
  → verified 15-min delay + 72h D1/600 row cap → website and free machine API
  → B2 backup, four UTC slots (00, 06, 12, 18)
       → same actual D1 rows (all pages, <=600)
       → private-only gzip under sha256 content-addressed object path
       → governed Backblaze S3 PUT + independent GET
       → exact compressed SHA256 + bounded gzip JSON restore
       → separate verified backup receipt
```

- B2 bucket: EXISTING private `geomacro-private-archive`, no new bucket.
- Archive path: `geomacro-evidence/v1/private/derived-news-journal/YYYY/MM/DD/SHA256.json.gz`.
- Only retained **Geomacro-owned** derived cards are stored, not raw publisher
  title, original article bytes, source links, platform secrets, exact HTML
  hashes, reviewer keys, GRO or commercial rights assertions.
- This archive is not an independent reviewed signed Intelligence/GRI/Risk
  Indices product, cannot cure legacy deep health 503 by itself, cannot
  certify commercial derived-use rights, and cannot authorize x402 payment.
- Source-native original publication time is NEVER extended by backup date.
  B2 snapshot `snapshot_as_of` is just backup clock.
- The source D1 journal remains 72h rolling; private immutable B2 backup
  is **historical**, not an automatic replacement for the public 72h feed.
  Existing website currently continues reading D1; no raw private B2
  blob is exposed by browser/client or machine API.
- B2 backfill/recovery of a historical archived snapshot into the live 72h
  journal is deliberately NOT automatic: it would replay expired publication
  items or first_seen clocks. A real archive can be restored manually through
  separately qualified/approved replay, never by changing source times.

## Zero-cost and fail-open architecture

Reuses already configured protected GitHub `production` environment:
`B2_KEY_ID`, `B2_APPLICATION_KEY`, optional
`B2_ARCHIVE_READ_KEY_ID`+`B2_ARCHIVE_READ_APPLICATION_KEY`,
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the
existing D1 database ID resolved by the canonical producer.
No additional Supabase, no paid request, no Lovable B2 credential.

Every B2 attempt is reserved through the **same account-wide D1 atomic
quota governor** under `derived_news_backup`; latest account limits
are 100 total/45 GET/55 PUT daily in the internal safety ledger, NOT
Backblaze guaranteed free-tier limits. B2 transaction caps may be lower.
Reserve at least 12 total/6 GET/6 PUT operations for other signed hot
publishers. Archive is restricted to four six-hour UTC slots per day
(or manual `workflow_dispatch`), max 8 normal classed B2 PUT/GET
operations per day (provider native fallback may require more).
This avoids flooding the provider as an hourly backup.

**Fail-open for public D1 ONLY:** if B2 storage credentials, API quota,
network or exact independent B2 readback fail, this optional step fails
visibly while genuine D1 free news still serves. Report
`B2_SHARED_ACCOUNT_RECOVERY_HEADROOM_HELD`,
`SKIPPED_SIX_HOUR_ARCHIVE_SLOT`,
`SKIPPED_NO_QUALIFYING_D1_NEWS` or
`B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED` truthfully; never relabel
a skipped backup as successfully stored. No private article titles/URLs
appear in Actions logs or public website.

## Activation and actual acceptance

1. Merge the gated tests/PR. Existing `website-derived-news-continuity.yml`
   automatically dispatches on main push or successful control-plane deploy,
   and retains its scheduled hourly `:07` best-effort cron.
2. Run `node --test scripts/tests/derived-news-b2-readwrite-backup.test.mjs`.
3. Protected main run, after `Independently verify public derived-news
   journal`, executes `Archive SAME genuine D1 Intelligence news to
   private B2 with exact PUT+GET readback`. Manual dispatch is allowed
   outside four UTC slots.
4. Look at **actual** GitHub job logs. Only
   `status=B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED` plus
   `b2_put_full_get_verified=true` proves B2 storage.
5. Independently GET the same D1 website journal and Geomacro's live
   Intelligence three-category toggles; the same owned derived news must
   be present. The D1 readback is not a direct proof of Lovable SHA parity;
   check `production-website-health.yml` separately.
6. The user-supplied Pallab/Suman signatures remain a **separate**
   independent GRI authority flow. This B2 backup does not use or bypass
   those keys and must never claim current signed 3/3 deep-health 200.

If B2 provider quota is genuinely exhausted, no background promise or
automatic repeated bypass is made. Next scheduled bounded attempt is
eligible when the provider/ledger quota allows it. For retention at scale,
configure and verify a Backblaze bucket lifecycle rule separately before
claiming physically automatic deletion; the current immutable objects
are append-only and not automatically deleted by this PR.
