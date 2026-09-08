# Structural context backend

Geomacro's structural country/corridor context is a **server-only read** from the separate historical-data warehouse. It is supporting evidence for Risk Objects, Risk Gate demos, research, and future commercial workflows. It is **not** a hidden GRI v1.2 scoring domain.

## Runtime configuration

Configure these only as server secrets:

```text
HISTORICAL_SUPABASE_URL
HISTORICAL_SUPABASE_SERVICE_ROLE_KEY
```

Never expose either value with a `VITE_` prefix and never make the historical service-role credential available to browser code.

## Allowed database interface

Main-product code may query only:

```text
commercial_structural_geopolitical_observations
```

It must not query the private raw table:

```text
structural_geopolitical_observations
```

The commercial view is the historical repository's governed attachment boundary. Review-gated material, including sanctions sources whose reuse status is not approved for commercial output, must remain excluded there.

## Current subject semantics

Supported context subjects:

- country: one ISO-3166 alpha-3 code;
- corridor: two different endpoint ISO3 codes.

The corridor implementation combines direct partner observations when available with each endpoint's country observations. This is **endpoint-composed context**, not full route, maritime, logistics, counterparty, or supply-chain-path modelling.

## Missing-data behavior

Structural evidence is never converted into a zero-risk value.

- missing runtime credentials → `NOT_CONFIGURED`;
- configured but no eligible rows → `UNAVAILABLE`;
- eligible curated rows → `AVAILABLE`.

A query failure also returns `UNAVAILABLE` with no fabricated replacement data.

## Methodology boundary

Every response is marked:

```text
EVIDENCE_ONLY_NOT_IN_GRI_V1_2
```

The structural adapter performs only bounded retrieval and latest-per-dimension/metric presentation compaction. It does not implement GRI normalization, weights, confidence, decay, source/story concentration, policy thresholds, or change attribution.

If structural evidence is ever promoted into a published score, that must happen through a new deterministic/versioned methodology with explicit validation, replay, documentation, and proof artifacts first.
