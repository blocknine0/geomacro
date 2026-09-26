# Free Source Priority

## Priority 1: implement first
- GDELT V2 / GAL for near-real-time geopolitics discovery and corroboration.
- World Bank Indicators for macro baseline.
- USGS MCS / minerals data for critical-minerals baseline.
- USGS Earthquake Hazards for global minute-level seismic alerts.
- Official national and international feeds for country-level primary evidence.
- NWS/NOAA active alert feeds where they materially improve U.S. hazard freshness.

## Priority 2: add redundancy
- UN Comtrade free API key.
- IMF SDMX.
- Eurostat.
- BIS public datasets and releases.
- ReliefWeb for humanitarian/geopolitical context under derived-only/source-rights controls.
- NASA FIRMS for near-real-time fire detections under its governed API/key boundary.
- Additional official international and national feeds.

## Telegram boundary
- Public Telegram channel scraping, harvesting, indexing, or aggregation is not an approved production intelligence source.
- MTProto public-channel collection is disabled in the production entrypoint.
- Telegram may be used only through an explicitly publisher-authorized push/bot/webhook submission path with active, revocable authorization recorded for the exact channel/content scope.
- Telegram-origin material remains non-customer-facing evidence; raw content is never redistributed by Geomacro.

## Priority 3: evaluate only if they materially improve coverage
- JRC RMIS.
- IEA critical-minerals datasets.
- commercial providers with genuinely usable licensed access.

## Principle
Do not add a source just to increase source count. Add it when it improves authority, geographic coverage, freshness, redundancy, or verification quality. Every source must remain fail-closed until its adapter, provenance, freshness, and commercial-use boundary are certified.
