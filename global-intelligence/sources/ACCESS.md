# Source Access Requirements

## No-key / free
- GDELT V2 / GAL
- World Bank Indicators API
- USGS minerals data
- BGS public minerals statistics where available
- UN/IMO/public government sources
- Eurostat public data

## Free API key or account
### UN Comtrade
Free API access exists. A free subscription key is available and should be preferred over preview endpoints for stable ingestion. Do not commit the key. Store it as a secret such as `UN_COMTRADE_API_KEY`.

### Telegram
Telegram's Bot API and Telegram API/TDLib are free. Public-channel ingestion requirements depend on the chosen client model. For broad public-channel collection, a Telegram API application may require `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`; these must never be committed.

### IMF
IMF data is exposed through SDMX APIs. Some API workflows may require an account/portal access. Add credentials only if the chosen endpoint actually requires them.

## User-provided credentials
Do not ask for credentials until the corresponding source adapter is ready and the source is proven useful. When needed, ask only for the exact credential names required.

## Commercial-use gate
A source is not production-approved merely because an API is free. Every adapter must record:
- commercial usage permission
- rate limit
- attribution requirement
- data licensing
- freshness
- machine-readable stability
- failure/retry behavior

## Rule
Free source + API key is preferred over paid source when it provides sufficiently authoritative, stable, current data for the category.
