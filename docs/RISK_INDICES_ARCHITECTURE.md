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

The normal app-owned direct database read remains the first compatibility path for existing `useGlobalRisk()` surfaces. If that hosted read is unavailable, the server fetches the same verified package from the authoritative Edge Function. A public unavailable state is returned only if both paths fail.

## Transition strategy

### Phase 1 — this change

- add the three-index public contract;
- serve it from the authoritative read-only Edge Function;
- switch `/global-risk` to the separate-index workspace while preserving the existing URL and SEO history;
- retain a legacy verified `GlobalRisk` compatibility payload from the Edge Function so homepage, institutional and other existing consumers do not fail while they migrate;
- do not mutate historical `gri_snapshots`.

### Phase 2 — consumer migration

Replace combined-GRI language/cards on remaining public surfaces with the three-index contract. Internal systems that genuinely need a multi-domain context object may keep an explicitly named composite internal object, but it must not be presented as the public headline index.

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

The Edge Function is intentionally deployed through the guarded manual workflow:

`.github/workflows/deploy-public-risk-indices-edge.yml`

Apply mode is allowed only from `main`, checks the authoritative Supabase project ref, deploys `public-risk-indices` with public JWT verification disabled because the function exposes bounded public read-only data, and performs a live smoke test requiring:

- HTTP 200;
- contract `risk-indices-v1.0.0`;
- parent `gri-v1.2.0`;
- proof `gri-proof-v1.2.0`;
- verification status `verified`;
- exactly three expected index keys;
- verified legacy compatibility payload.

No migration, score recomputation, payment activation, mainnet activation or write permission is part of this deployment.
