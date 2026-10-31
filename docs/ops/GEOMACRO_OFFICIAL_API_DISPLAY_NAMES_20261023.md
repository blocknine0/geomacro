# GEOMACRO — Official API Names

**Branding decision (23 October 2026):** In all *display names*, use **GEOMACRO** rather than the technical HTTP verb `POST`. The three official products are:

| Display name shown to people and agents | HTTP method (machine only) | Actual endpoint |
| --- | --- | --- |
| GEOMACRO Geopolitics API | POST | `/api/v1/intelligence/geopolitics` |
| GEOMACRO Macro/FX API | POST | `/api/v1/intelligence/macro-fx` |
| GEOMACRO Critical Minerals API | POST | `/api/v1/intelligence/critical-minerals` |

**Shared core:** `GEOMACRO Intelligence API` maps to the existing `POST /api/v1/intelligence/query`. **AI:** `GEOMACRO AI Agent API` maps to `POST /api/v1/agent`.

The display catalog is defined once in `src/lib/geomacro-official-api-branding.ts`, and surfaced as `official_api_display_names`/`official_api_catalog` in `GET /api/v1/pricing` and `GET /api/v1/agent`, and as `officialApiDisplayNames`/`officialApiCatalog` in dynamic x402 discovery. Official Agent OpenAPI's user-facing operation summaries also use the branded names while keeping the existing operation IDs, HTTP methods and paths.

**Do not replace an HTTP verb with GEOMACRO on the wire.** HTTP clients must still send a POST request; `GEOMACRO` is a product brand, not an HTTP method. Existing `official_api` method/path strings are retained for backward compatibility, and integrations should use the separate official brand-name field for human presentation.

No new API engine, no price changes, no x402 payment authorization, no real-funds activation, no seller wallet change, no Supabase, and no edits to founder-locked public website files. The three category routes still dispatch into the shared canonical governed engine. Actual current signed commercial eligibility and production health remain independently verified and cannot be inferred from names.


## 31 October 2026 — universal internal & website display label

**Every internal or customer-facing display of a GeoMacro API address** uses
`geomacro.live /api/...` (hostname, one space, canonical endpoint path). This
includes the Store, developer directory, agent discovery, pricing manifest,
machine marketplace descriptions, and internal operations dashboards.

Do not render `POST /api/...` or `GET /api/...` as an API **name**.
Transport methods remain `POST`/`GET` in actual HTTP requests,
OpenAPI operations, curl invocations, signature validation and x402 rules.
The pricing catalog exposes `official_api_transport_legacy` for clients
requiring the old transport-labeled strings.

Use `formatGeomacroApiDisplayPath(path)` from
`src/lib/geomacro-official-api-branding.ts` for any new display.
Do not duplicate literal hostname or derive API payment authority from a label.
