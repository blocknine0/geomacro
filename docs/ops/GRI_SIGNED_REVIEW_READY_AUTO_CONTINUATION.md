# Genuine signed material → GRI v1.2 → Risk Indices automatic continuation

**Scope:** event-driven continuation after independently approved current GRI input, NOT from a news headline or the 72-hour unscored triage queue. Reuse the existing canonical GRI method, separate reviewer signatures, source rights, B2 SHA/gzip readback, D1 hot promotion. No Supabase or real-money payments.

## Producer contract

An independently authorized producer that ALREADY uploaded immutable signed reviewed current GRI input and country-category certificate B2 objects with independently pinned SHA256 may send a GitHub repository_dispatch event called gri_reviewed_current_ready:

~~~json
{
  "event_type":"gri_reviewed_current_ready",
  "client_payload":{
    "schema":"geomacro.signed-reviewed-gri-ready.v1",
    "reviewed_b2_key":"geomacro-evidence/v1/private/reviewed-gri-current/<sha256>.json",
    "reviewed_b2_sha256":"<sha256>",
    "reviewed_certificates_b2_key":"geomacro-evidence/v1/private/reviewed-country-certification/<sha256>.json",
    "reviewed_certificates_b2_sha256":"<sha256>"
  }
}
~~~

This trigger is NOT rights authorization or an independently reviewed GRI result. Protected production workflow checks exact main SHA and Lovable publication, and the two keys must be exact content-addressed paths matching the supplied SHA BEFORE B2 reads. Existing reviewed publisher checks independently signed GRI inputs, event-level independently corroborated originals, source rights, source-native freshness, audited scoring, country/category certificates, independent B2 historical continuity, GRI v1.2 canonical portable proof reproduction and B2/D1 exact readback. It refuses incomplete or forged inputs.

The current canonical calculation records previous independently verified B2 score and real numerical difference (PR #2427). This does NOT claim signed causal event-level change attribution; change_hash/change_attribution stay null.

When and only when this publisher finishes successfully on the same protected main SHA, the existing Risk Indices workflow auto-continues from exact verified D1 parent and again checks B2 and zero-money security guards.

## Caller implementation

Producer with repository WRITE authorization invokes GitHub REST POST /repos/blocknine0/geomacro/dispatches with the above body AFTER independently approved real B2 uploads. Never expose GitHub token, raw publisher bytes or private reviewer signatures in website/news/user traffic. Manual workflow_dispatch remains an explicit recovery route.

Event must NOT be triggered by raw ingestion, unreviewed material queue, public source health, an artificial timestamp renewal, or a public API buyer. It does not remove legitimate external reviewer/source-use rights requirements, authorize payment, or guarantee 195x3 current coverage. No real current signed input presently means no actual new index score or HTTP 200; a fixed workflow cannot manufacture that input.
