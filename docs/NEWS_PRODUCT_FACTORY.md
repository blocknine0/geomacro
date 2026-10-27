# Automated news-to-product factory

One existing news input is extracted once and compiled into twelve product
work packets using GeoMacro's canonical price schedule. The packet contains
structured event tags, named organizations, action terms, numeric mentions,
original publication time, country scope, possible transmission channels,
validation gaps and product-specific drafts and canonical requests.

## Permanent execution

The existing **All Registered Source Reusable JSON Production** workflow runs
this factory after successful canonical D1 ingestion/readback. It writes
a bounded receipt and one full sample in
`artifacts/reusable-source-news/products.json` alongside `news.json`. Full packets
are reconstructed through the private reader or CLI instead of storing thousands
of duplicated product payloads on every scheduled run. No additional source polling, model provider, recurring workflow,
credential, database or per-product SQL write is introduced. Existing quota
admission still controls intake. Delayed/held intake is not reported as fresh.

D1's existing bounded 25-hour news journal is the durable input. The factory is
a deterministic projection with a SHA-256 content/version/scope hash, so the
same input can be reconstructed after an artifact expires. Changed facts or
scope produce a new hash; a later processing clock alone does not. This hash
proves content identity, not truth or independence. Twelve products remain
one source input, never twelve corroborating sources.

The scheduled sample contains drafts and canonical request templates. It
**does not precompute or certify twelve currently saleable products**. Actual
existing context is materialized only for a selected request, preserving the
quota budget and the existing independent commercial qualification engine.

## Private operator tool

```sh
bun scripts/ops/news-product-factory.ts \
  --input news.json --output products.json --destination CAN
```

Input uses the existing `ReusableNewsInput` contract: category, text, optional
country ISO3, exact original publication UTC and source metadata. Source
metadata and article/headline text are not copied into the output. Numeric
mentions remain unbound unless a separate governed engine proves their
meaning; a 25-basis-point mention is not silently promoted to an official
current rate or a measured asset move.

Optional actual product-context preparation:

```sh
bun scripts/ops/news-product-factory.ts \
  --input news.json --output prepared.json --product country_profile
```

This uses `materializeNewsProduct` and the exact existing admission, price and
response assembler. It requires the normal private application read/verification
configuration; it does not enable merchant payments. Successful output is
`QUALIFIED_CONTEXT_PREPARED` with a genuine validated context payload and the
canonical purchase request. The extraction draft stays explicitly separate
from the qualified customer bytes. Missing/unverified/stale context remains
unavailable, and no quote or durable payment reservation is created.

Product IDs are `country_digest`, `corridor_digest`, `country_profile`,
`corridor_profile`, `query_focused`, `query_standard`, `query_complex`,
`signed_existing`, `signed_new`, `gate_existing`, `gate_standard`, `gate_complex`.

- Country scope must be known. A global or ambiguous story does not imply USA.
- Corridors require an explicit ordered origin/destination; none is fabricated.
- Profiles request additional existing qualified dimensions. One story is not
  sufficient proof of a whole country or both corridor endpoints.
- New signed objects require `--issued-after` with a recent legitimate UTC
  cutoff and a real already-published verified object. The factory cannot mint
  signatures or scores. Gate bundles retain their included signed-object price.
- A country news mention is a candidate routing hint, not verified relevance.
- Public users and machines purchase through the existing canonical
  `POST /api/v1/intelligence/query`; each request is requalified and its exact
  bytes are bound to the price and settlement before delivery.

## Private machine reader

`GET /v1/internal/news-product-factory` on the existing Control Plane is behind
its existing authentication. It reconstructs packets from one bounded indexed
D1 read, with no writes. Query options: `id` (64-hex D1 news ID), `country`,
`limit` (1–40), or the returned `before` + `before_id` keyset cursor. There is
no public raw/draft feed or public factory credential.

The response contains packets, content hashes, exact price/request mappings,
explicit blockers and a next cursor. It is private and noncacheable. Existing
25-hour retention and fresh-source clocks apply on every read. Old rows are
excluded even when a retention sweep has not yet executed.

## What customers can return for

The reusable product contracts provide stable machine fields, original dates,
exact subject/topic scope, reproducible content hashes, and explicit gaps.
Updated inputs produce detectable revisions; a subsequent canonical request
can obtain newly qualified context. These are repeatable product behaviors,
not a guarantee of repeat purchases, risk accuracy or uninterrupted global
coverage.

## Example and release status

`docs/examples/news-product-factory-input.json` is a **synthetic demonstration**,
not a real announcement. `news-product-factory-output.json` is the actual CLI
output. Update the original UTC time before rerunning it outside its 25-hour
window. The unknown source license and unverified extraction remain explicit.

Code and automation must be merged/deployed before the new private Worker
reader is available. Offline fixtures and a successful build do not prove a
live source report or paid merchant settlement. No PREDGE file, integration,
workflow, credential or deployment configuration is changed.
