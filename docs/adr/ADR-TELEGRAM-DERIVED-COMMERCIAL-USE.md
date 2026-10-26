# ADR: Owner-supplied Telegram public-export derived structured data

**Date:** 2026-10-25
**Decision by:** Geomacro owner Pallab Das
**Status:** Proposed by owner; explicit ADR review/sign-off required before merge
**Scope:** only manual Telegram Desktop `Export chat history` files
submitted by the owner into a private B2 prefix.

## Decision and limitations

Geomacro records the owner's instruction to enable **derived-only structured
research output** from owner-supplied public export files. This is a
**declaration by the owner**, represented exclusively as
`OWNER_DECLARED_TELEGRAM_DERIVED_ONLY`, **not** source-rights
`VERIFIED` and not Telegram/platform/legal clearance. The owner assumes
responsibility for complying with Telegram terms, posters' copyright and
other data/content rights. This engineering record is **not legal advice**.
The implementation itself cannot establish those permissions.

No Telegram API, MTProto, `t.me` fetch, bulk channel collection,
raw text/media/header/handle/post link/message ID redistribution, scoring,
signing or risk-gate promotion. Signed products and their independent
signature/reviewer requirements are unchanged. Source rights of every
other provider remain unchanged. Real-money ACKs, prices, pricing manifest,
commerce ledger and x402 settlement are unchanged.

The export journal is private, source-neutral and 72h retained. Paid use
is **OFF** by default under `TELEGRAM_DERIVED_PAID_ENABLED=false`. A future
paid activation is a distinct owner action and requires verifiable
source-specific commercial usage permissions and matching existing paid
answer/evidence contracts, not merely this declaration.

## Traceable change log

| File | Previous rule / text | New scoped rule / text | Reason |
| --- | --- | --- | --- |
| `scripts/commercial-source-policy.mjs` | Only previously listed provider VERIFIED rights statuses | Additional separately named owner declaration, `verified:false`, derived-only export scope | Trace owner's decision without changing any certified source |
| `docs/TELEGRAM_RAW_SIGNAL_GOVERNANCE.md` | Telegram-only evidence cannot directly enter paid intelligence | The ban stays for channel/Bot leads; manual export derived records are a **separate unverified file-input lane** with paid flag OFF | No backdoor through live channels |
| `docs/ops/TELEGRAM_FREE_SOURCE_PERMANENT_INDEPENDENCE_20261024.md` | 152 handles not licensed, don't harvest public channels | Both remain true; owner exports are distinguishable manual files, not proof of licence | Do not conflate discovery with consent |
| `scripts/audit-telegram-governance.mjs` | Database-only channel enabled/MTProto/commercial-source assertions | Preserve old channel checks **and** add explicit new export-file network ban and ADR/right-state audit | Fail closed for forbidden network collection |
| `scripts/lib/telegram-export-derived-json.mjs` | No deterministic owner-export parser | File-only projection, no URLs/raw output, dedupe, fixed authored summary and unknown TZ | Owner requested T2 |
| `workers/control-plane/src/telegram-export-derived-json.mjs` | No private export journal | Protected hash-idempotent unverified 72h derived-only D1 journal | Owner requested T2 |
| `scripts/ops/telegram-export-ingest.mjs` | No B2 owner-export batch ingester | Protected B2-only file ingestion with shared quota gate | Owner requested T2 |
| `.github/workflows/owner-telegram-export-derived-json.yml` | No dedicated export scheduler | Bounded file-only offline tests and protected production cron | Owner requested T2 |

No other source's previously approved status changes. No previous direct
Telegram webhook/MTProto consumer is enabled or modified as a consequence
of the owner export decision.

## Owner prerequisites and acceptance

Before any production processing, configure
`GEOMACRO_TELEGRAM_EXPORT_PREFIX=telegram/owner-exports/` as protected
production variable, a private B2 key capable of reading exactly this
prefix, and verify/set a B2 lifecycle that expires raw exports within 72h.
Set `GEOMACRO_TELEGRAM_EXPORT_LIFECYCLE_CONFIRMED=YES` **only after**
actual configuration. Files should be `result.json` or an opaque SHA-256-style filename,
never chat names, handles or messages. Never upload exports to GitHub.

The export files may be the owner's copy but their authors' rights and
Telegram's platform restrictions remain relevant. The owner must sign off
this ADR before merge, as T1 explicitly requires.

**Not accepted merely by merging:** independently verified rights,
193+2 Telegram country coverage, public paid eligibility, independently
reviewed signed products or actual USDC revenue.
