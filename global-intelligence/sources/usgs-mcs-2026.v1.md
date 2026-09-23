# USGS MCS 2026 Adapter

Primary release: USGS Mineral Commodity Summaries 2026 Data Release, DOI 10.5066/P1WKQ63T.

Machine-readable asset:
- ScienceBase item: 696a75d5d4be0228872d3bf8
- file: MCS2026_Commodities_Data.csv
- expected format: long-form CSV
- release date: 2026-09-18
- license: CC0

The release covers U.S. salient statistics and world production statistics for 90+ nonfuel mineral commodities.

Mapping:
- Mine production / explicit production statistics become PRODUCTION.
- Import/export statistics remain trade evidence.
- Other world-production rows remain WORLD_PRODUCTION_BASELINE unless the statistic explicitly identifies production.

Runtime policy:
- No value is inferred from a missing row.
- Country names are preserved until canonical ISO3 mapping.
- The original statistic/detail/unit/year/value are retained.
- CSV URL can be overridden with USGS_MCS_2026_CSV_URL.
- No API key is required by the release itself.