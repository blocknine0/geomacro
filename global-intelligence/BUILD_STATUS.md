# Global Intelligence v1 Build Status

## Started
- Isolated branch: `feature/global-intelligence-v1`
- Production `main` remains untouched.
- Source registry and verification policy created.
- Free/no-key and free-key source candidates recorded.
- Telegram authority tiers recorded.

## Source availability assessment

### Already available as free/no-key baseline
- GDELT
- World Bank
- USGS minerals
- Eurostat/public official datasets
- official government/statistical/central-bank endpoints where available
- public UN/IMO sources

### Free key/account candidates
- UN Comtrade free API
- Telegram API / TDLib
- IMF SDMX access where endpoint/account requirements permit

### Not production-approved yet
- JRC RMIS
- IEA critical-minerals data
- commercial news APIs with restrictive free tiers
- any unverified Telegram channel

## User input likely required later
1. Telegram API application credentials for broad public-channel collection, if the selected implementation requires MTProto/TDLib.
2. UN Comtrade free API key for stable higher-limit ingestion.
3. IMF credentials only if the selected IMF endpoint requires them.

Credentials must be supplied only through the application's secret/environment mechanism. Never put them in Git.

## Next gates
1. Import the canonical 195-country registry into the isolated track.
2. Generate the 585-cell matrix.
3. Implement live source adapters.
4. Implement Telegram source verification and ingestion.
5. Implement cross-source verification.
6. Run category-specific runtime probes.
7. Run full 585-cell certification.
