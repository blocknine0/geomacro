# Geomacro Global Intelligence v1

Isolated build branch for the 195-country, three-category intelligence system.

## Categories
- GEOPOLITICS
- MACRO
- CRITICAL_MINERALS

## Architecture
question -> router -> one or more category engines -> source adapters -> normalization -> cross-source verification -> structured answer.

The country baseline is derived from Geomacro's canonical country registry. The system is not merge-ready until structural, source, runtime, provenance, Telegram, and failure-mode gates all pass.

## Credential requirements
- UN_COMTRADE_API_KEY for the free-key Comtrade API path
- TELEGRAM_API_ID + TELEGRAM_API_HASH for MTProto public-channel ingestion
- optional TELEGRAM_BOT_TOKEN for Bot API sources
- optional IMF_API_TOKEN if the selected IMF endpoint requires it

Never commit secrets.
