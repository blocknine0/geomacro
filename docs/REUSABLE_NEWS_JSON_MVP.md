# Reusable news to JSON MVP (all three categories)

## One route for pasted material

Open /data-api on the Geomacro website. Paste source text, select
Geopolitics, Macro / FX or Critical Minerals, declare the source's stated
license class, and optionally add publisher, original HTTPS URL, ISO3 and
exact publication time. Generate, inspect, copy or export JSON.

POST /api/v1/intelligence/live-structured

Sample JSON body:
{"mode":"news-json","news":{"category":"macro-fx","text":"The Federal Reserve announced a 25 basis points benchmark policy rate decrease. The statement identified inflation at 2.4 percent.","source_name":"Federal Reserve","license":"unknown","country_iso3":"USA"}}

For bounded automation batches, submit:
{"mode":"news-json","items":[...]}
The request body is capped at 16 KiB; duplicate batch items are removed by
noncryptographic identity hints, never treated as signed source proofs.

Returns geomacro.reusable-news-json.v1: category, optional country, supplied
source metadata, event/action categories, organizations, numeric mentions,
and source rights/quality labels. Raw article text, headlines and verbatim
sentences are not included. The endpoint does not persist input, contact
Groq or any source, make payments, or claim original page verification.

## One automatic live pipeline

GET /api/v1/intelligence/query?view=reusable-news-json

Optional existing filters: &domain=macro (or geopolitics, rare_earth)
and &country=USA (ISO3). The server projects news rows already admitted
to the existing bounded 72-hour three-domain D1 derived journal with
the same deterministic normalizer. This is not evidence that every source,
country, article or publisher in the world is covered.

.github/workflows/reusable-news-json-export.yml reads the live API
on a GitHub best-effort 15-minute schedule or workflow_dispatch, validates
the no-raw/no-unverified-commercial flags, and exports a 3-day artifact.
A deployed website release is required. Passing CI does not prove live
GitHub Actions or production runtime acceptance.

## Commercial and noncommercial input handling

Every source declaration class (commercial, noncommercial, public_domain,
unknown) can be normalized as bounded factual indicators. A declared
license label never becomes a verified, item-scoped commercial grant;
noncommercial upstream prose is not made commercially redistributable
just because it becomes JSON. Existing Geomacro Facts, Rights,
independent evidence, signing and x402 authorization continue to
govern any separate paid use. No current paid endpoint or fixed price
is changed. No premium provider, credential, Supabase dependency,
new database or laptop scheduler is added.
