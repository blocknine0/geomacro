# Structural context backend

Geomacro's structural country/corridor context is a **server-only read** from the separate historical-data warehouse. It is supporting evidence for Risk Objects, Risk Gate demos, research, agentic-commerce workflows, and future commercial products. It is **not** a hidden GRI v1.2 scoring domain and it does not silently modify the signed GRO v0.2 score contract.

## Runtime configuration

Configure these only as server secrets:

```text
HISTORICAL_SUPABASE_URL
HISTORICAL_SUPABASE_SERVICE_ROLE_KEY
```

Never expose either value with a `VITE_` prefix and never make the historical service-role credential available to browser code.

### Independent historical Supabase runtime

The historical project is **a separate Supabase database** from main Geomacro's standby/recovery Supabase. Main `GEOMACRO_SUPABASE_RUNTIME_MODE` does **not** govern the historical database or its credentials.

`GEOMACRO_HISTORICAL_SUPABASE_READ_MODE=off` is the safe, quota-preserving default for main application reads. With `fallback`, the server first checks the verified private B2 structural snapshot; only if the subject lacks an available B2 profile does it query the historical project's curated serving views using server-only historical credentials. It never queries raw historical tables. The setting does not turn on any historical ingestion workflow, migrations or database writes.

Historical ingestion and migration jobs are independently controlled by the historical repository. Existing disabled production schedules/holds remain disabled until a separately authorized quota and safety review; do not interpret the main Supabase freeze as the source of these historical-specific controls.

Example server-only configuration:

```dotenv
GEOMACRO_SUPABASE_RUNTIME_MODE=standby
GEOMACRO_HISTORICAL_SUPABASE_READ_MODE=fallback
HISTORICAL_SUPABASE_URL=<dedicated-historical-project-url>
HISTORICAL_SUPABASE_SERVICE_ROLE_KEY=<dedicated-server-secret>
```

Do not populate either historical credential from main `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.

### Independent historical-to-main live connection proof

`.github/workflows/historical-data-connection.yml` now runs a three-domain,
one-row-per-view **server-side historical-only readback**, weekly and upon
changes to the probe contract. Its URL is pinned to the historical Supabase,
and its credentials come only from `HISTORICAL_SUPABASE_SERVICE_ROLE_KEY`.
It uses exactly three bounded REST GETs, no sort/full scans, no database
writes, no main Supabase queries, no D1 queries and no B2 operations.
The geopolitical country-profile probe is scoped to `country_iso3=eq.USA`
to prevent a global aggregate from hiding an expensive query behind LIMIT 1.
PR tests do not access live credentials; the first main push readback reports
real historical production access separately.

This **proves serving-interface reachability only**, not whole-world coverage,
full historical backfills, fresh snapshots, restored high-volume writers or
production website activation. The main SSR historical direct read remains
`GEOMACRO_HISTORICAL_SUPABASE_READ_MODE=off` unless explicitly opted into
`fallback`; neither probe changes that setting or the main Supabase standby.

## Governed database interfaces

The historical warehouse's base commercial evidence boundary remains:

```text
commercial_structural_geopolitical_observations
```

The preferred subject-serving interfaces are:

```text
commercial_structural_country_profiles
commercial_structural_country_coverage_latest
commercial_structural_corridor_latest
```

The main product must never query the private raw table:

```text
structural_geopolitical_observations
```

The serving views are derived only from governed historical data. Review-gated material, including sanctions sources whose reuse status is not approved for commercial output, remains excluded by the historical source-policy boundary.

### Rollout fallback

Migration `20260909001400_structural_country_corridor_serving.sql` introduces the subject-serving views. During the one-time deployment window, application code may temporarily fall back to `commercial_structural_geopolitical_observations` **only when PostgREST/PostgreSQL reports that a serving relation is genuinely missing from the schema**.

The fallback must not run for arbitrary database errors, permission failures, malformed responses, or empty-but-valid profiles. Those conditions fail closed. Once the serving migration is present, normal country/corridor requests use the serving layer automatically.

## Country semantics

A country request uses one ISO-3166 alpha-3 code and prefers `commercial_structural_country_profiles`.

The country profile is an evidence-availability/provenance read model, not a risk score. It exposes latest governed observations across available structural dimensions and source/coverage metadata. Missing dimensions remain missing; they are never filled with zero values.

## Corridor semantics

A corridor request uses two different endpoint ISO3 codes and prefers `commercial_structural_corridor_latest`.

The current corridor contract is:

```text
composition_method = ENDPOINT_COMPOSED_V0_1
route_modeling_status = NOT_MODELED
```

The response composes:

1. the origin country structural profile;
2. the destination country structural profile;
3. direct bilateral evidence when an eligible observation explicitly contains a matching country/partner-country pair.

This is **endpoint-composed context**, not full route, maritime, logistics, counterparty, correspondent-bank, sanctions-screening, payment-path, or supply-chain-route modelling.

A lack of direct bilateral evidence is disclosed as `NO_DIRECT_BILATERAL_EVIDENCE`; it is not treated as evidence of low risk.

## Missing-data behavior

Structural evidence is never converted into a zero-risk value.

- missing runtime credentials → `NOT_CONFIGURED`;
- configured but no eligible rows/profile → `UNAVAILABLE`;
- eligible curated rows → `AVAILABLE`.

A non-rollout query failure also returns `UNAVAILABLE` with no fabricated replacement data.

## Methodology boundary

Main-product responses are marked:

```text
EVIDENCE_ONLY_NOT_IN_GRI_V1_2
```

The underlying historical warehouse rows remain stamped:

```text
EVIDENCE_ONLY_NOT_IN_GRO_V02
```

These labels describe two related boundaries: structural evidence is not part of the current public GRI v1.2 calculation and is not an undisclosed input to the current signed GRO v0.2 score contract.

The structural adapter performs retrieval, governed subject composition, coverage disclosure, and bounded latest-observation presentation only. It does not implement GRI normalization, weights, confidence, decay, source/story concentration, policy thresholds, change attribution, a structural risk score, or an execution decision.

If structural evidence is ever promoted into a published score, that must happen through a new deterministic/versioned methodology with explicit validation, historical replay, documentation, proof artifacts, and a deliberate activation step first.
