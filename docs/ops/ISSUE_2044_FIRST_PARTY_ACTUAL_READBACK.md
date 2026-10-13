# #2044 — real original-page bytes + native publication readback

Previously the private source adapter used the field
`original_article_sha256` to mean `sha256(canonical_article_url)` in some
legacy observations. That identity fingerprint is **not proof of content**.
The new private readback validator refuses that ambiguous field rather
than silently treating a URL hash as an HTML body hash.

## Bounded genuine first-party HTTPS readback

`scripts/ops/verify-private-original-page-readback.mjs` accepts bounded
private stdin with schema `geomacro.private-original-page-readback-input.v1`:

```json
{
  "schema": "geomacro.private-original-page-readback-input.v1",
  "originals": [
    {
      "category": "macro",
      "same_event_claim_sha256": "<actual claim SHA-256>",
      "originating_reporting_organization_id": "federal_reserve",
      "original_article_url": "<actual first-party pinned article URL>",
      "original_published_at": "<publisher native UTC original time>",
      "reporting_position": "confirms",
      "expected_html_sha256": "<optional actual previously read HTML SHA-256>"
    },
    {
      "category": "macro",
      "same_event_claim_sha256": "<same claim SHA-256>",
      "originating_reporting_organization_id": "ecb",
      "original_article_url": "<actual different first-party article URL>",
      "original_published_at": "<its original publisher UTC time>",
      "reporting_position": "confirms"
    }
  ]
}
```

Those are **schema examples only**, not a claim that the Fed and ECB
actually reported the same event. A real candidate must use real, distinct
articles and a valid precisely identified event claim from intake.

Run on a trusted, ephemeral private operator context with private input:

    node scripts/ops/verify-private-original-page-readback.mjs < /secure/readback-input.json

The fixed issuer registry and existing category-bound first-party URL path
allowlist authorize only accepted HTTPS original-article routes; UN News has
an additional narrowly pinned `news.un.org/en/story/...` route.
Reject unapproved hosts/path/query, repeated issuer or URL, differing claim
hash, stale source timestamp, redirect/403/429, non-HTML, >384KiB, invalid
UTF-8, missing/conflicting/imprecise publisher original-page timestamp,
>10-minute feed-to-page clock mismatch or expected **HTML byte** SHA drift.
At most four originals; one GET each; no retries; four-second timeout.

The sanitized PRIVATE receipt contains only per-article HTML SHA-256 and
original publication timestamps, not original URLs, publisher names,
upstream headlines, article bodies, private keys or customer questions.
No B2/D1/Supabase operation and no payment are executed.

## Explicit separation from commercial truth

Even a 2/2 authentic original-page readback does **not** establish:
same-event semantic corroboration, legal derived-use rights/attribution,
external human reviewer approval, scored GRO, D1 current hot publication
or x402 acceptance. Each field remains false. Existing FEDERICO_STRICT
independent-review requirement remains entirely unchanged.

A real automated Geomacro-signed **commercial** receipt may follow only
after actual same-claim evidence and counterevidence review, source
article-by-article commercial-use compatibility with Geomacro's
no-source-disclosure customer contract, and independent B2 rights
registry readback. Never sign a paid-ready object from a bare URL SHA,
headline match, stale B2 baseline or this readback alone.
