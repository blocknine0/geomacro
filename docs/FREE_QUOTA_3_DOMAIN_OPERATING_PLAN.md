# Geomacro three-domain free-quota operating contract (2026-10-09)

Scope: geopolitics, macro/FX and critical minerals; governed monitoring, source verification, private scoring, signed derived publication and x402 availability. This is a **target design and bounded experiment**, not a claim that fresh public paid data currently exists.

## Immutable safety and business boundaries

- First 20,000 **successful** x402 calls are a controlled pilot; no owner-authorized real funds until explicit ACK. 0.05 USDC/call is the currently advertised conditional pilot price, not revenue already earned.
- Only latest **verified, rights-approved, independently corroborated** and schema-valid signed risk objects may enter public paid delivery. A new GDELT index timestamp, Telegram lead, World Bank series refresh or private model stage is **not** a public breaking-news risk score.
- All per-source original event clocks stay source-native. No silently shifted `published_at`, score, severity, missing=zero, fabricated coverage or unverified promotion.
- Do not mutate frozen Supabase DB; no `storage.objects` SQL deletes. B2 cleanup only after independent full GET/hash/restore. No raw sources to customers or Actions logs. x402 fail closed before charging if coverage is missing.
- Shared B2 account caps, API models and source rights are **unverified** until measured; do not infer quota headroom from per-workflow request budgets.

## Public published baseline, not guaranteed account entitlement

Check official current provider terms and the account dashboards before increasing workload:
- Cloudflare Workers Free: 100,000 requests/day, 10ms CPU/request, 50 subrequests/request, up to 5 account cron triggers; avoid complex inference in the Worker request path.
- Cloudflare D1 Free: 5,000,000 rows read/day, 100,000 rows written/day, 5 GB stored **account total**. Quota exhaustion returns errors; no invented emergency writes.
- Backblaze B2: first 10GB stored free; advertised Class A/B/C APIs free on pay-as-you-go, **but account-specific daily transaction/data caps may still block requests**; enforce the stricter live cap. No promise that previous reported download-cap block is gone.
- GitHub public standard-hosted Actions are included free, private-repo Actions use account plan minutes/storage; do not move high-frequency workflows to either private repository without a measured cap.
- Groq and other free inference tiers are account/model/day/token-specific. Read actual live remaining/Retry-After, stop on 429, and use deterministic non-model transforms for metadata, dedupe and structural indicators.
- 20,000 successful calls are **over the pilot period, not guaranteed within any 24-hour window**; provider and L1 chain/settlement fees may be separate.

## Target daily reserve envelope (operator policy, not measured consumption)

| Resource | Proposed hard alert/budget policy | Evidence needed |
| --- | --- | --- |
| Worker requests | Reserve 20,000/day of the 100,000 Free limit; prefer <=60,000/day total until measured | Cloudflare analytics aggregate request count |
| D1 row reads | Reserve 1,000,000/day; per-request query plans must be bounded/indexed | D1 rows-read analytics across **all** workers |
| D1 row writes | Reserve 20,000/day; batch/dedupe current-state upserts, avoid each-source-record hot write | D1 daily rows-written analytics |
| D1 storage | Alarm at 3.5 GB (5 GB Free total); compact checkpoints in D1, bulk history in B2 | D1 storage bytes and 7-day growth |
| B2 normal GET | Start with <=25/day **across all producers/consumers**, reserve emergency readback; actual account cap wins | Account-wide Class-B + GET/readback meter |
| B2 storage | Alarm at 8 GB of 10 GB free; do not auto-prune without byte verified restore | Actual used-byte total |
| Classifier | Strict project/model/day tokens and requests as returned by provider; no fixed universal free inference assumption | Rate-limit headers, model receipts excluding text |
| Source reads | Poll provider *global* incremental feeds, not 195x3 per-country scans; 30m GDELT is observational only | Per-provider 200/429 and last valid original-date |
| GitHub Actions | Scheduled main-public-repo jobs bounded, no model/B2 network on PR checks; reduce duplicate scheduled writers | Account/billing and Actions runner-minute telemetry |

The B2 GET goal is an operating *target*, not a verified account-wide daily quota. Independent upload readback is mandatory, even if this uses up the goal. On insufficient reserve, pause new batches before touching user payment or archive pointers.

## Existing implementation and next gating items

1. **Discovery**: 30-minute global GDELT discovery-only monitor. After GDELT degradation, this PR checks three fixed first-party RSS/Atom domains; backup receipts contain only allowed counts and keep the GDELT monitor RED. This is a bounded observational backup, not public scoring or a complete provider-independent feed mesh.
2. **Official/private evidence**: use fixed UN, Fed, USGS and bounded independent official alternates. Keep original source/native published dates, dedupe by event-family, rights pending by default, and no Telegram-only truth.
3. **Global fanout**: one new verified event updates impacted country/entity/corridor keys. Do not poll all 195 countries x 3 categories individually every five minutes. For macro scheduled releases, follow the official release calendar; for mineral structural baselines, refresh source-native cadence.
4. **Private assessment**: existing canonical scoring and B2 PUT -> independent B2 GET/hash/gzip restore -> D1 compact pointer readback already proved on bounded 3-domain staging. Reuse this; do not bootstrap a second scoring engine.
5. **Publication**: independently certify source reuse and same-event corroboration, then produce versioned/signature-verified risk objects and evidence timestamps. PUBLIC scored 0/3 is still blocked until proof.
6. **Serving**: D1 hot manifests/signatures first, B2 immutable archive for restore; never B2 GET or run a classifier on every API availability/payment request. Three aliases share one canonical query/delivery authority. Invalid/stale/unavailable -> no-charge rejection.
7. **Production quota ledger (STAGED — NOT GLOBAL PROTECTION YET)**: PR #1827 follow-up adds an atomic D1 account-wide daily UPSERT with fixed server-side hard limits: 80 total B2 API requests, 25 GET, 55 PUT, 10 HEAD, and 10 native-authorize attempts/day; it retains per-workflow counts. Calls must reserve **before** any B2 network operation, and unverified/ambiguous failures retain tickets conservatively (no unsafe refund). The existing private-scoring manual canary opts in via `B2_ACCOUNT_QUOTA_REQUIRED=1`; other unmodified B2 scripts and external Telegram producer **are not automatically covered**. This is operationally safe staged rollout, **not** a completed global cap. Migrating every B2 producer/consumer and proving real headroom remains OPEN. The default per-process `B2_REQUEST_BUDGET` is unchanged. If the D1 schema, token, quota or receipt is unavailable, opted-in clients fail before B2 network operations.
8. **End-to-end proof (NOT YET ACHIEVED)**: exact-main CI, live 3-domain scored records with rights and independent source proof, true D1/B2/DO usage counters, one-hour no-funds x402 endpoint tests, 195x3 real availability census, outage/recovery drill, owner-approved live single purchase, independent partner verification. Production and rights gates remain closed until proven.

## Example 20,000-call pilot sizing, not an SLA

A **10-day** cohort with 2,000 successful calls/day, and an assumed upper estimate of **three** Worker requests and **four** D1 row writes per settled call, costs ~6,000 Worker requests/day and ~8,000 D1 row writes/day *for commerce alone*. Add real page traffic, discovery, D1 query scan amplification, retries, rate limits, signatures and storage before accepting this budget. If an implementation actually performs more requests or row writes, recalibrate from tracing, not the example. Revenue before fees at 0.05 USDC x 20,000 = **1,000 USDC maximum gross** if every one of these 20,000 calls settles successfully.

## Stop/alert conditions

- Source 429 -> stop further same-provider calls per cycle; try bounded independent original publisher discovery; retain degraded primary status.
- No current independent same-event evidence/rights -> keep prior timestamped verified history, never manufacture scored current records and never charge.
- D1/B2/Worker quota unknown or near reserve -> halt the costly operation, preserve immutable archive, carry durable idempotency/retry state and report incident.
- B2 full GET/hash/restore fails -> do not advance D1 checkpoint or delete source payload.
- Frozen Supabase -> no writes; retain existing normal/frozen budget guard.
- x402 delivery cannot prove current rights, GRO signature, replay-safe settlement and product hash -> no funds accepted.

No part of this document changes upstream licensing or constitutes a 24/7 data SLA.
