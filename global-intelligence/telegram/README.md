# Telegram Source Mesh

Telegram is a first-class low-latency source transport in v1, with verification-aware authority.

## Tiers
- VERIFIED_OFFICIAL: institutionally controlled and identity verified.
- SPECIALIST: credible specialist source; corroboration layer.
- EARLY_SIGNAL: useful but not independently authoritative.

## Required metadata
source_id, channel_id, channel_name, category, country_iso3, identity_verified, authority_level, enabled_for_ingestion, enabled_for_confirmation, last_message_at, last_verified_at, health_status.

## Safety rules
- Never treat unknown Telegram posts as confirmed facts.
- Preserve original message reference and retrieval time.
- Deduplicate repeated forwards.
- Cluster messages into canonical event families.
- Require corroboration before promotion.
- Record conflicts rather than overwriting them.

## Credentials
Expected secret names:
- TELEGRAM_API_ID
- TELEGRAM_API_HASH
- optional TELEGRAM_BOT_TOKEN when Bot API is sufficient

Never commit credentials.
