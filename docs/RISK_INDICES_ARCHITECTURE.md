# Geomacro Separate Risk Indices Architecture

## Decision

Geomacro's public risk-index product is moving from one combined Global Risk Index headline to three independently presented indices:

- **Geopolitical Risk Index** — stored category `geopolitics`
- **Macroeconomic Risk Index** — stored category `macro`
- **Critical Minerals Risk Index** — stored category `rare_earth`

`rare_earth` remains the historical storage/category identifier during the v1.2 migration so existing snapshots, hashes and replay evidence are not rewritten. Public product language uses **Critical Minerals Risk Index** because the domain is broader than rare-earth elements alone.

## Why the split can preserve the current proof record

GRI v1.2 already calculates a category score separately inside each domain after applying:

1. canonical event eligibility;
2. confidence weighting and recency decay;
3. per-source evidence caps;
4. immutable story-cluster caps;
5. category-local weighted severity aggregation.

Only after those category scores exist does v1.2 normalize the active category weights and combine them into the old global headline score.

The first public split therefore does **not** recalculate history with a new formula. It projects the already-persisted verified category scores from the current `gri-v1.2.0` / `gri-proof-v1.2.0` snapshot package.

Public projection contract:

- `risk-indices-v1.0.0`
- parent methodology: `gri-v1.2.0`
- parent proof: `gri-proof-v1.2.0`
- proof scope: `verified-category-projection`

Every response retains the exact parent snapshot ID and methodology/input/evidence/calculation/disposition/proof/change hashes.

## Standalone change semantics

The old combined GRI stored category `deltaPoints` as the category's contribution to the **combined** score change. That number is not the correct change number for a standalone domain index.

For the separate public indices:

`standalone change = current category score - previous category score`

This distinction prevents an old normalized-weight contribution change from being mislabeled as an index-level score change.

## Missing-domain rule

A missing domain is **unavailable**, never zero.

The public contract always contains three stable index slots. If a current verified snapshot does not contain one domain, that index returns:

- `status = unavailable`
- `score = null`
- `rawScore = null`

No synthetic estimate or zero-risk substitute is allowed.

## Permanent public-store availability architecture

The recurring `Risk index store unavailable` failure came from making the public website's verified read path dependent on database credentials being correctly injected into the Lovable/SSR runtime.

PR #454 improved server-side environment-name recovery, but any hosted runtime with no valid authoritative database binding could still return no client at all.

The durable architecture removes that hosting binding as a single point of failure:

`authoritative Supabase project -> public-risk-indices Edge Function -> Geomacro public server/UI`

The Edge Function:

- runs inside the authoritative Supabase project `ldpwajisioljyjtojvfx`;
- uses Supabase-native server credentials available to that runtime;
- accepts `GET` only;
- contains no database mutation operation;
- reads only the current published GRI snapshot package and bounded recent public evidence metadata;
- independently re-checks the current methodology/proof/story versions, verified status, hashes, candidate/event/story invariants and reconciliation residuals;
- rejects future-dated or invalid proof packages;
- does not expose the service-role credential;
- does not expose upstream publisher identity fields;
- returns an opaque unavailable response if verification fails.

The normal app-owned direct database read remains the first compatibility path for existing `useGlobalRisk()` surfaces. If that hosted read is unavailable, the server fetches the same verified package from the authoritative Edge Function. A public unavailable response is produced internally only if both verified paths fail.

Website hooks deliberately fail soft:

- an already verified reading remains visible when a later refresh fails;
- a cold-start outage stays in a neutral loading/retry state instead of rendering a public error card;
- diagnostics are still logged through the application error reporter;
- a failed read never becomes zero or a synthetic score.

## Transition strategy

### Phase 1 — this change

- add the three-index public contract;
- serve it from the authoritative read-only Edge Function;
- switch `/global-risk` to the separate-index workspace while preserving the existing URL and SEO history;
- switch the homepage risk preview to the three-index contract;
- retain a legacy verified `GlobalRisk` compatibility payload from the Edge Function so institutional, intelligence and other existing consumers do not fail while they migrate;
- do not mutate historical `gri_snapshots`.

### Phase 2 — consumer migration

Replace combined-GRI language/cards on remaining secondary public surfaces with the three-index contract. Internal systems that genuinely need a multi-domain context object may keep an explicitly named composite internal object, but it must not be presented as the public headline index.

### Phase 3 — independently persisted next-generation indices

After methodology review and replay validation, persist separate immutable index snapshots, contributions and proof packages under a new schema instead of rewriting `gri_snapshots`.

The future persisted model should key every proof object by `index_key` and independently record:

- methodology version/hash;
- input/evidence/calculation hashes;
- exact contribution ledger;
- source/story caps;
- score and previous score;
- score-change attribution;
- event/source/story counts;
- confidence and coverage;
- verification status and proof hash.

Historical GRI v1.2 remains immutable audit evidence.

## Production deployment

The Edge Function deployment is owned by:

`.github/workflows/deploy-public-risk-indices-edge.yml`

Pull requests run only the read-only/deployment guard validation. A relevant push to exact `main` automatically deploys the function to the authoritative Supabase project and performs the live smoke test. Manual `workflow_dispatch` remains available with `plan` and `apply` modes for diagnosis or controlled redeployment.

The deployment path:

- checks the exact authoritative project ref `ldpwajisioljyjtojvfx`;
- requires the existing production Supabase deployment credentials;
- deploys only `public-risk-indices`;
- uses public JWT verification disabled because the endpoint is intentionally bounded public read-only data;
- performs no database migration or data write;
- smoke-checks HTTP 200;
- requires contract `risk-indices-v1.0.0`;
- requires parent `gri-v1.2.0`;
- requires proof `gri-proof-v1.2.0`;
- requires verification status `verified`;
- requires exactly the three expected index keys;
- requires the verified legacy compatibility payload.

No score recomputation, payment activation, mainnet activation or write permission is part of this deployment.
