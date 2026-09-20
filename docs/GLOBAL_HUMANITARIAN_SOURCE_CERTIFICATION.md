# Global Humanitarian Source Family Certification

Status: INTERNAL GOVERNANCE · REGISTRY-ONLY · PRODUCTION PROMOTION FAIL-CLOSED
Review date: 2026-09-20

This document defines the certification boundary for the next global humanitarian/food/health source families registered in migration 941_global_humanitarian_source_families.sql.

## Registered sources

| Source ID | Provider | Purpose | Current state |
|---|---|---|---|
| iom_dtm_api_v3 | IOM DTM | Displacement / mobility pressure | REVIEW_REQUIRED, disabled |
| ocha_reliefweb_api_v2 | UN OCHA / ReliefWeb | Humanitarian event discovery and corroboration | REVIEW_REQUIRED, disabled |
| faostat_api | FAO | Food/agriculture structural stress | REVIEW_REQUIRED, disabled |
| who_gho_odata_api | WHO | Health-shock context | PERMISSION_REQUIRED, disabled |

Registration is not ingestion permission and is not commercial eligibility.

## Collector contract

A source may not be promoted until its collector has a source-specific contract containing:

1. canonical endpoint(s) and API/version identifier;
2. authentication requirement and secret-free local self-test;
3. pagination/rate-limit behavior;
4. deterministic request parameters;
5. response schema and required fields;
6. publisher record identifier;
7. source publication/update timestamp;
8. Geomacro retrieval timestamp;
9. exact geography identifier and ISO3 mapping rule, where applicable;
10. source release/version identifier where available;
11. normalized payload hash;
12. raw-response hash when raw bytes are retained;
13. provenance URL;
14. attribution metadata;
15. deletion/correction/versioning behavior;
16. duplicate/idempotency key;
17. stale-data threshold;
18. negative/failure behavior;
19. rights state read from live_external_sources;
20. explicit distinction between evidence-only persistence and commercial scoring.

## Certification gates

### Gate A — Source contract
The endpoint and response contract must be reproducible without relying on browser-only behavior.

### Gate B — Rights
The exact dataset and intended Geomacro use must be covered by documented reuse terms or explicit permission. An official publisher or an open API does not automatically imply commercial eligibility.

### Gate C — Provenance
Every normalized observation must retain enough metadata to reconstruct which source release and record produced the observation.

### Gate D — Coverage
Coverage must be measured against the authoritative Geomacro geography registry. Missing countries/regions are reported rather than silently inferred.

### Gate E — Freshness
Freshness is source-specific. No generic real-time label is accepted without measured publication/retrieval behavior.

### Gate F — Corroboration
Humanitarian event signals must have an independent path where the coverage target requires two paths. Aggregators are not counted as original-source corroboration.

### Gate G — Negative tests
The collector must fail closed for malformed responses, missing timestamps, unknown geography, duplicate records, stale payloads, rate-limit responses, revoked credentials, rights-state drift and unexpected schema changes.

### Gate H — Production promotion
Only after A-G pass may enabled_for_ingestion be set to true. Commercial scoring additionally requires commercial_usage_status = COMMERCIAL_OK, enabled_for_commercial_signals = true, a versioned methodology and production evidence.

## Source-specific constraints

### IOM DTM
DTM API v3 provides structured displacement information and P-coded administrative geography. API access requires registration/authentication. The collector must preserve the DTM release/update timestamp, project/country context, administrative P-code and the distinction between reported, estimated and unavailable values.

### OCHA ReliefWeb
ReliefWeb API v2 is read-only and continuously updated, but since 1 November 2025 requires a pre-approved appname. ReliefWeb also states that API content can contain material copyrighted by original information partners. Therefore the first production adapter is metadata/derived-signal oriented and must not assume that an API response is freely redistributable.

### FAOSTAT
FAOSTAT launched a new API developer portal in April 2026. The database terms state that datasets are generally CC BY 4.0 subject to additional terms and third-party exceptions, including restrictions concerning promotion of commercial enterprises/products. Therefore the source remains review-gated even though the API itself is machine-readable and broadly accessible.

### WHO GHO
WHO GHO exposes indicator data through OData. Exact dataset-level reuse and intended commercial use must be cleared before production ingestion. No WHO data is enabled merely because the API is public.

## Promotion invariant

The following must remain true until explicit certification:

- all four source IDs are disabled for ingestion;
- all four source IDs are disabled for commercial signals;
- no source is silently promoted by application code;
- no raw publisher content is exposed through customer delivery;
- no source contributes to GRI/GRO scoring merely because it exists in the registry.

## Next implementation order

1. Build read-only collector contract/self-tests.
2. Register source-specific release manifests.
3. Run no-write global coverage census.
4. Verify rights/attribution metadata.
5. Add duplicate/stale/schema-drift/quarantine tests.
6. Produce independent corroboration evidence.
7. Only then consider source activation.