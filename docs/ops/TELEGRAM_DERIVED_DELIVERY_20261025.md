# Telegram Desktop owner export — T1/T2/T3 operational delivery

## Exact scope

Owner-supplied `Telegram Desktop > Export chat history > Machine-readable JSON`
files only. Neither production nor tests request Telegram API, MTProto,
`t.me`, messages or post links. **Do not upload private export JSON to
GitHub**. This is not the old Bot webhook/152-channel collector.

Owner decision: `OWNER_DECLARED_TELEGRAM_DERIVED_ONLY` applies ONLY
to manually supplied exports; it is NOT `VERIFIED` commercial publisher
licensing. Platform and poster permissions still need separate review.
Everything that remains outside the owner export scope (signed GRI,
Risk Gate, GRO, x402 real funds) remains unchanged.

## Input and mapping

Supported export shapes: `{messages:[...]}` or
`{chats:{list:[{messages:[...]}]}}`. Text can be a string or
array of strings/objects with `text`. Ignore non-message, empty or
ambiguous categories; normalize and dedupe text with a private SHA-256.
Native `date_unixtime` is preferred; missing -> `UNKNOWN_TZ` and
`source_native_published_at:null`. Never infer an exact timezone.

The current deterministic baseline classifier shares Geomacro's existing
critical-minerals domain anchor and category/topic vocabulary. Its fixed
0.65 denotes a rule-match confidence, **not** truth confidence or a
licensed/corroborated source. Ambiguous cross-category messages are
dropped, not assigned a guessed topic. Unresolvable country -> null;
only explicit canonical ISO3 identifiers qualify. Numeric values
are extracted only together with explicit written units.
Short Geomacro-authored summaries use fixed safe taxonomy templates:
long verbatim overlap is rejected.

Stored customer-relevant fields:
`schema_version,category,topic_code,country_iso3,event_type,derived_summary,
source_native_published_at,time_quality,observed_at,provenance,rights_state,
verification_status,confidence,numeric_mentions,language,scored,
execution_authorized`.

Private SHA-256 text/chat fingerprints are separate D1 indices, never
included in the readable projection or a customer output. Raw export
text, sender, message IDs, post URLs and media are not stored in
the derived D1 rows, returned by API or uploaded to CI artifacts.
A 72-hour D1 retention applies, with a maximum 300 compact entries.

## Private B2 and deployment settings

One-time owner/environment setup in GitHub's protected `production`
environment:
- `GEOMACRO_TELEGRAM_EXPORT_PREFIX=telegram/owner-exports/`
- `GEOMACRO_TELEGRAM_EXPORT_LIFECYCLE_CONFIRMED=YES` **only after**
  B2 private raw-export lifecycle expiry at or before 72 hours is
  actually configured and verified
- Existing protected `B2_KEY_ID`, `B2_APPLICATION_KEY`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and
  `GEOMACRO_COMMERCE_LEDGER_TOKEN`.

Each B2 private object can be the Telegram Desktop `result.json`
file at `telegram/owner-exports/result.json` **or** named
`telegram/owner-exports/<sha256-of-raw-json>.json`.
No chat handles, original titles or usernames in object names.
The job checks the filename hash against the actual object bytes.

After the owner supplies real export files and the verified 72h
lifecycle, `Owner Telegram Desktop Export Derived JSON (No Funds)`
runs six-hourly and on explicit workflow_dispatch. It queries B2
objects with a tightly bound ListObjectsV2 request under the existing
D1 B2 account-wide GET request quota. It skips processed source-object
hashes, reads at most two small exports per run, then writes only the
derived JSON to the existing protected control-plane D1.

Protected paths, bearer token mandatory:
- `PUT /v1/internal/telegram-export-derived-json`: strict derived-only
  batch, no raw content, idempotent by source hash.
- `GET /v1/internal/telegram-export-derived-json?country=IND`:
  private bounded 72h structured research JSON, never publicly served.
- `GET /v1/internal/telegram-export-derived-json?object_sha256=...`:
  private source-hash processed check, never original bytes.

The task intentionally **does nothing** if the export prefix variable
has not been configured. It fails closed if an owner-configured prefix
has no verified lifecycle, missing protected credentials or exhausted
shared B2 quota.

## T3 existing prices / commercial boundary

The existing price catalogue remains authoritative:
`intelligence_query/focused` = **0.05 USDC (50,000 atomic)**;
`standard` = **0.10 USDC (100,000 atomic)**;
`complex_multi_source` = **0.15 USDC (150,000 atomic)**.

`src/lib/telegram-export-paid-eligibility.ts` implements a restricted
unverified research candidate check. It requires
`TELEGRAM_DERIVED_PAID_ENABLED=true` for candidate assessment;
**default is false**. Its no-funds check does not authorize a
canonical x402 quote or customer settlement. Complex_multi_source
also requires at least two distinct private chat identities;
`UNKNOWN_TZ` and stale/missing exact dates fail recency-specific
focused queries. No signed capability is changed.

Every derived claim remains labeled
`provenance:TELEGRAM_PUBLIC_EXPORT`,
`verification_status:UNVERIFIED_CLAIM`, confidence, as-of and:
"Derived from an unverified public Telegram post; not independently confirmed."

The owner's proposed 402 integration is **NOT accepted** until this
unverified output is supported by the complete existing paid response
contract, payment ledger, authenticated source-private fetch,
platform/publisher rights review and exact finished buyer bytes.
Do not flip the flag to claim rights are VERIFIED. Neither owner
rights declaration nor green CI creates those proofs.

## Acceptance status by stage

- T1 owner ADR and explicit code scope: implemented, pending owner
  review/sign-off before merge.
- T2 source parser, D1 store, private B2 runner and cron: implemented;
  acceptance requires green contract test, complete CI and production
  B2/Cloudflare readback with real owner files.
- T3 exact pricing and candidate checks: implemented as no-funds
  guard, not wired to canonical payable 402; payment readiness blocked,
  no `GEOMACRO_COMMERCIAL_LAUNCH_ACK` or wallet-key modifications.
- Source-specific legal compliance: owner/dependent publisher matter,
  not a verification claim made by the tool.
