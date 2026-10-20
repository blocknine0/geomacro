# D1 legacy source-directory private lookup and measured coverage

Supabase-free source-directory shadow: 779 exact rows transferred on 2026-10-20
and verified by a two-pass source REST SHA256 manifest, followed by D1 byte/hash
and cardinality readback in GitHub Actions run #39459307233.

New protected Cloudflare Worker routes (both require the existing **control-plane
admin Bearer**, never the Predge or research Bearer):

- `GET /v1/internal/source-directory?dataset=primary&country_iso2=US`
- `GET /v1/internal/source-directory-coverage`

`dataset` is one of `primary`, `statistics`, `monetary`,
`critical_minerals`; `country_iso2` must be two uppercase letters. Exactly
one row per lookup. Its stored JSON SHA256 is independently rechecked before
a response. No public CORS. Missing `statistics,VA` returns 404, never a
fictional source. Directory coverage returns 195/194/195/195 and a total of
779, or a clear 503 if the snapshot is incomplete or D1 errors.

**These are private metadata lookup surfaces only.** Returned registry
records contain internal provider URL/notes and must not be copied into paid,
public, or partner output. Source discovery status is inherited without
rewriting it. The API ALWAYS returns:
`source_activated=false`, `original_live_retrieval_verified=false`,
`derivative_commercial_rights_approved=false`,
`partner_output_authorized=false`, `chargeable=false`.
No deployment activates anything or creates an entitlement.

Actual production user intelligence remains derived from separately fetched,
time-verified licensed official originals. Archived directory metadata does not
establish 195-country 20-minute updates, a fresh signed GRO, 195-category
numerical coverage or permission to distribute raw news.

Rollback: remove the private GET router cases, leaving the shadow table as a
private retained archive. Do not delete the source archive unless independently
read back and explicitly approved. No new runtime Supabase dependency.
