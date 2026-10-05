# Telegram External Raw-Signal Governance

Status: **PUBLISHER AUTHORIZATION REQUIRED · RAW-SIGNAL ONLY · PRODUCTION PROMOTION FAIL-CLOSED**

Public/unauthorized Telegram scraping is not an approved Geomacro production source. Telegram may enter Geomacro only through an explicitly governed publisher-authorized path. Telegram is never authoritative by itself and never directly becomes commercial intelligence.

## Hard rules

1. `telegram_mtproto_flash` remains disabled for ingestion and commercial signals.
2. The only production-candidate source is `telegram_authorized_publisher_feed`, and it is default-off.
3. A channel/publisher must exist in `live_telegram_channel_registry`.
4. `manual_review_status` must be `APPROVED`.
5. `publisher_authorized` must be `true`.
6. `authorization_scope`, `authorization_reference`, and `authorization_granted_at` are mandatory; expired authorization is invalid.
7. `enabled` must be `true` before the authorized feed itself may be activated.
8. Every Telegram content ingest enters as `UNVERIFIED`; caller-provided verification/severity is ignored at the database boundary.
9. Raw Telegram body/payload is stripped from the hot event row. Raw/private content must never be customer-facing.
10. Telegram-only evidence cannot directly enter Risk Indices, Risk Gate, paid intelligence, public Early Warning, or a customer-facing Risk Object.
11. Independent corroboration and the normal source-rights/provenance/freshness gates remain mandatory before promotion.
12. Telegram sources can never set `enabled_for_commercial_signals=true`; only governed derived evidence may later become commercially eligible through the canonical pipeline.

## Authorization record

Before enabling any Telegram publisher path, record:

- canonical channel/publisher identity;
- `manual_review_status=APPROVED`;
- explicit publisher authorization;
- precise authorization scope;
- internal evidence reference for the authorization;
- authorization granted timestamp;
- optional expiry timestamp;
- geographic/domain coverage;
- reviewer and review reference;
- rights boundary and raw-redistribution boundary.

Do not store credentials, private-message contents, or other secrets in the authorization reference fields.

## Activation sequence

A publisher-authorized channel is prepared first:

```sql
update public.live_telegram_channel_registry
set
  manual_review_status = 'APPROVED',
  publisher_authorized = true,
  authorization_scope = '<approved-use-scope>',
  authorization_reference = '<internal-evidence-reference>',
  authorization_granted_at = now(),
  authorization_expires_at = null,
  enabled = true,
  reviewed_at = now(),
  reviewed_by = '<operator>',
  review_reference = '<internal-review-reference>',
  updated_at = now()
where channel_key = '<canonical_channel_key>';
```

Only after a valid enabled publisher authorization exists may `telegram_authorized_publisher_feed.enabled_for_ingestion` be set to `true`. A database trigger rejects activation without that evidence. `telegram_mtproto_flash` cannot be re-enabled.

## Canonical evidence path

```text
publisher-authorized Telegram submission
        ↓
source registry + authorization evidence
        ↓
UNVERIFIED / scoreless raw signal
        ↓
integrity hash + source record/dedupe identity
        ↓
country/category mapping + event-family dedupe
        ↓
independent corroboration
        ↓
source-rights / provenance / freshness gates
        ↓
CORROBORATING / VERIFIED / REJECTED
        ↓
only governed VERIFIED derived evidence may reach canonical commercial truth
        ↓
Intelligence / Ask / Risk Gate / Risk Indices / x402 projections
```

Telegram uses the same `live_flash_events` / corroboration / canonical evidence path as other governed fast signals; there is no Telegram-only scoring database and no product-specific Telegram truth.

## Outage/degradation behavior

Telegram is optional lead evidence. An outage or disabled Telegram path must degrade Telegram independently and must not block the canonical non-Telegram acquisition, scoring, B2/D1 serving, or customer-facing products. No missing Telegram signal may be synthesized or replaced with fake evidence.

## Customer-output boundary

Customer output may contain only derived, governed intelligence. It must not expose private Telegram content, raw publisher text/media, internal authorization evidence, access credentials, or raw provider payloads.
