# Telegram External Raw-Signal Governance

Status: **MANUAL REVIEW REQUIRED · INTERNAL ONLY · PRODUCTION PROMOTION FAIL-CLOSED**

Geomacro may monitor third-party public Telegram channels as a fast lead-intelligence layer. Telegram is not an authoritative source and is never sufficient by itself to promote an event into production intelligence.

## Hard rules

1. Only publicly addressable Telegram channels with a public username are eligible.
2. Private groups, invite-only channels, restricted chats, or sources reachable only because the operator account has private access are not eligible.
3. A channel must exist in `live_telegram_channel_registry`.
4. `manual_review_status` must be `APPROVED`.
5. `enabled` must be `true`.
6. Every Telegram item enters as `UNVERIFIED`, regardless of what the worker or sender requests.
7. Source reliability comes from the reviewed server-side registry, not from worker-provided metadata.
8. Telegram-only evidence cannot directly enter Risk Indices, Risk Gate, paid intelligence, public Early Warning, or a customer-facing Risk Object.
9. Independent corroboration and existing source-rights/provenance gates remain mandatory.
10. Raw Telegram publisher text/media remains internal research material unless reuse rights are separately cleared.

## Manual review checklist

Before approving a channel, record:

- exact public username and public `t.me/<username>` URL;
- publisher/channel identity and whether ownership is official, publisher-run, unverified, or an unofficial relay;
- geographic/domain coverage;
- whether the channel routinely cites original sources;
- known repost/aggregation behavior;
- language;
- expected value as a lead source;
- rights boundary: normally `INTERNAL_RESEARCH_ONLY` or `DERIVED_ONLY`;
- reviewer and review reference;
- decision: `APPROVED` or `REJECTED`.

Approval only allows raw-signal ingestion. It does not make the source commercially reusable and does not reduce corroboration requirements.

## Activation sequence

After manual approval, deliberately update the registry row:

```sql
update public.live_telegram_channel_registry
set
  manual_review_status = 'APPROVED',
  enabled = true,
  reviewed_at = now(),
  reviewed_by = '<operator>',
  review_reference = '<internal-review-reference>',
  updated_at = now()
where channel_key = '<public_username_lowercase>';
```

Then add the same public username to the worker's `TELEGRAM_CHANNELS` deployment secret/configuration.

Both layers must agree. Environment configuration alone cannot authorize ingestion.

## Promotion boundary

```text
public Telegram channel
        ↓
manual-approved raw source
        ↓
UNVERIFIED flash
        ↓
dedup / repost-family detection
        ↓
independent corroboration
        ↓
source-rights / provenance / freshness gates
        ↓
CORROBORATING / VERIFIED / REJECTED
        ↓
only governed VERIFIED derived evidence may reach production intelligence
```

A high prior reliability score never bypasses independent corroboration.

## Owner-supplied Desktop JSON export track (25 Oct 2026)

This document's public-channel/Bot ingestion and paid-intelligence prohibition
remains binding for channel leads. A separate owner-supplied **file-only**
Telegram Desktop export path now admits *private, unverified structured
research* under the scoped owner rights state
`OWNER_DECLARED_TELEGRAM_DERIVED_ONLY`, **not** `VERIFIED`.
It neither authorizes automated Telegram collection nor independently clears
platform/copyright rights. The paid feature switch is OFF by default and the
signed/score/GRI gates remain unchanged. See the owner ADR.
