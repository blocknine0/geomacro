# GDELT Native Pipeline Scheduler

Status: PRELAUNCH DATA-PIPELINE INFRASTRUCTURE

This scheduler improves the freshness and reliability of Geomacro's existing GDELT GAL evidence pipeline. It does not activate public Early Warning alerts, commercial signals, payments or mainnet execution.

## Why the scheduler moved

The former primary GDELT GAL mutation workflow relied on a GitHub Actions `schedule` event every 15 minutes. GitHub documents that scheduled workflows can be delayed during high load and queued jobs can be dropped under sufficiently high load.

That behavior is acceptable for backup/maintenance automation but is not a strong primary freshness primitive for a near-live intelligence pipeline.

The primary schedule therefore moves into the existing Supabase production environment:

`pg_cron -> pg_net -> scheduled-gdelt-pipeline Edge Function`

The old GitHub workflow remains available as an explicit manual fallback.

## Cadence

The native job runs at:

`3,13,23,33,43,53 * * * *`

This is a ten-minute cadence, offset away from common top-of-hour scheduling pressure.

## Pipeline sequence

One leased orchestrator run performs:

1. authenticate the scheduler request against a Vault-backed random token;
2. acquire the `gdelt_gal_native_pipeline` lease;
3. invoke `live-gdelt-ingest` with the existing scoped ingest token;
4. invoke `live-structure-intelligence` three times to drain newly ingested fragments in bounded batches;
5. reconcile stored structured-event commercial eligibility from `live_structured_event_commercial_rights_evaluation`;
6. release the lease as `succeeded` or `failed`;
7. return only a bounded operational summary.

## Concurrency

`live_pipeline_scheduler_leases` prevents overlapping scheduled pipeline runs.

The lease TTL is bounded between 60 and 900 seconds. The orchestrator currently requests 480 seconds. A second invocation while the lease is valid returns `lease_held` without running the mutation pipeline.

A failed run records a bounded error message and releases the lease. An expired lease can be recovered by a later run.

## Scheduler authentication

The scheduler token is not committed to GitHub.

Production deployment:

1. generates a fresh random 256-bit token;
2. masks it in GitHub Actions;
3. stores/rotates it in Supabase Vault under `geomacro_gdelt_pipeline_scheduler_token`;
4. smoke-tests the verifier;
5. calls the orchestrator with the token;
6. only after the smoke succeeds, installs the cron job.

The Edge Function validates the supplied token through the service-role-only `verify_gdelt_pipeline_scheduler_token` RPC. `anon` and `authenticated` cannot execute the verifier.

Existing internal `LIVE_INGEST_TOKEN` and `LIVE_STRUCTURE_TOKEN` secrets remain the scoped credentials for their respective child functions.

## Database permissions

The scheduler lease table is service-only with RLS enabled.

The following RPCs are denied to `PUBLIC`, `anon` and `authenticated`:

- scheduler token verification;
- lease acquisition;
- lease release;
- rights reconciliation;
- native pipeline invocation;
- cron installation.

Only the RPCs required by the orchestrator are granted to `service_role`. Cron invocation and installation remain database-owner operations.

## Commercial/source-rights boundary

The native scheduler does not change source policy.

GDELT GAL remains subject to the existing `DERIVED_ONLY` commercial boundary for publisher-derived material. Raw publisher article content is not a customer product. The pipeline reconciliation step derives event delivery eligibility only from the authoritative provenance rights evaluation view.

The orchestrator response explicitly reports:

```text
raw_source_material_redistributed = false
public_alert_activation = false
commercial_signal_activation = false
payment_or_mainnet_activation = false
```

## Deployment safety

The production deployment workflow:

- checks the exact production Supabase project ref;
- checks the authoritative database URL;
- deploys the relevant Edge Functions before enabling cron;
- applies only migration `939_gdelt_native_pipeline_scheduler.sql` rather than broad-pushing unrelated pending migrations;
- rotates the Vault scheduler token;
- runs one full pipeline smoke;
- requires a successful scheduler lease state;
- installs the cron only after the smoke succeeds;
- runs the existing hot-topic readiness audit afterward.

## Manual fallback

`.github/workflows/gdelt-gal-live-sync.yml` remains available through `workflow_dispatch`.

It is no longer a scheduled mutating workflow. This avoids two independent schedulers racing over the same ingestion and structuring state.

## Rollback

To stop native scheduling without deleting data:

```sql
select cron.unschedule('geomacro-gdelt-native-pipeline-10m');
```

The manual GitHub fallback can then be invoked while the native scheduler is investigated.

Do not delete historical fragments, structured events, manifests, fingerprints or cursor evidence as part of scheduler rollback.
