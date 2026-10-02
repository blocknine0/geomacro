# Phase A runtime freshness

Phase A maintains a registry-driven 3-domain runtime matrix for every enabled `live_country_registry` row.

The production refresh path is intentionally independent of Supabase REST/Storage egress. It uses direct PostgreSQL for compact control-state updates and Backblaze B2 for immutable runtime evidence.

## Canonical runtime fallbacks

- `geopolitics` -> `gdelt_v2_events`
- `macro` -> `world_bank_indicators`
- `rare_earth` -> `usgs_mcs`

A refresh succeeds only after the exact official endpoint response passes its source-specific parser, the compact evidence manifest is written to B2 and read back with matching SHA-256, and the source remains eligible under the reviewed commercial-rights contract.

Source certification is performed through the existing 10-dimension evidence graph. Eligible certification younger than 24 hours is reused so the 15-minute freshness loop does not append 30 evidence nodes every cycle. Certification is rebuilt when it is missing, invalid, or older than the bounded reuse window.

## Runtime cadence

The GitHub Actions workflow runs every 15 minutes. This keeps the 30-minute geopolitics freshness window covered with retry margin while also refreshing the longer macro and critical-minerals windows. Workflow concurrency cancels an older overlapping run.

## Fail-closed rules

No target timestamp is refreshed unless all three official source probes have passed and the B2 evidence write/readback is verified. The final gate requires every registry x domain cell to be `production_ready`, with zero unavailable rows, zero invalid-ready rows, zero invalid-fallback rows, and zero duplicate matrix rows.

This workflow does not enable payment, settlement, transaction authorization, or mainnet activation.
