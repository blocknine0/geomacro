# Geomacro Historical Data integration

Repository: `blocknine0/geomacro-historical-data`

The historical repository is a separate provenance-first warehouse. Its own integration contract says the main Geomacro product must consume curated serving interfaces, not raw warehouse tables or historical service-role credentials in browser code.

## Cross-checked capabilities

### Geopolitics
- GDELT, UCDP GED, UNHCR forced displacement and World Bank WGI evidence.
- Curated country/corridor serving relations.
- Historical rows remain evidence-only and do not silently alter GRI/GRO methodology.
- OFAC/UNSC remains review-gated in the historical contract.

### Macro
- World Bank commercial macro allowlist.
- Maddison Project long-run context, separately attributed and versioned.
- FRED research/cross-check only.
- OECD/Eurostat dataset-specific review.

### Critical minerals / rare earths
- BGS World Mineral Statistics is the historical rare-earth backbone.
- Scope is 1950-present, with machine-readable BGS from 1970 and a separate 1950-1969 archival lane.
- USGS is retained as a separate cross-check.
- Missing is not zero.
- Source-versioned rare-earth observations and canonical views exist.

## Integration rule

The global intelligence branch may use this repository as a **historical evidence source**, but only through curated serving interfaces.

It must never:
1. expose `HISTORICAL_SUPABASE_SERVICE_ROLE_KEY`;
2. treat historical data as live/current evidence without timestamping;
3. overwrite primary current-source observations;
4. silently fill missing values;
5. feed historical observations directly into GRI/GRO scoring.

Historical observations should enter cross-source reconciliation as separate evidence with:
- repository/source ID;
- source table;
- observation/published time;
- provenance;
- source hash/version where available;
- methodology status.

## Credential

Runtime integration requires the historical Supabase project credentials:

`HISTORICAL_SUPABASE_URL`
`HISTORICAL_SUPABASE_SERVICE_ROLE_KEY`

These must be server-side only and never committed.
