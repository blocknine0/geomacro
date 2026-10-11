# Telegram manual research → Geomacro private corroboration review

This is a **local offline research-review handoff**. It is NOT a live data collector, public API, x402 response, scoring function or a license to aggregate Telegram content. It does not call Telegram/other publishers and does not write B2, D1, Supabase or GEO risk objects.

## Provenance and separation

- Producer: blocknine0/geomacro-telegram-signals, docs/INTERNAL_MANUAL_RESEARCH.md, schema geomacro.telegram-human-research-lead.v1.
- Consumer: blocknine0/geomacro, scripts/verify-telegram-manual-research-review.mjs.
- A person can manually consult an ordinarily accessible public post, subject to Telegram terms and source rights, and produce an **offline hashed research pointer** using the producer helper. Source text, pictures, link/post ID, Telegram session and API credentials are not in the pointer.
- An editor then enters any potential independent original-publisher URLs and purported publisher-family identifiers for follow-up verification. Different hostnames or editor-entered families are NEVER proof of independent publisher ownership.
- The Geomacro helper creates a private corroboration review packet for **human validation only**. Source-native time is claimed, never independently verified by the script. References to Telegram are hashes, not proof of real messages.
- After human investigation, an entirely separate canonical Geomacro process must verify the actual first-party evidence, original article publication dates, independent publisher families, event materiality, source rights, scoring, GRO signing, risk gate and pay-per-call eligibility. No automatic transition or mutation exists from this packet into the customer or x402 pipeline.

## Example (illustrative only, synthetic evidence)

The input JSON is private and must live outside the repository:

~~~json
{
  "schema": "geomacro.internal-manual-corroboration-review.v1",
  "human_review_requested": true,
  "research_pointer": {
    "schema": "geomacro.telegram-human-research-lead.v1",
    "reference_id": "tgresearch_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "reference_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "category": "GEOPOLITICS",
    "topic_code": "SANCTIONS",
    "country_iso3": "USA",
    "source_native_published_at_claimed": "2026-10-10T19:00:00Z",
    "observed_at": "2026-10-10T19:05:00Z",
    "historical_reference": false,
    "source_kind": "PUBLIC_TELEGRAM_MANUALLY_VIEWED",
    "reference_registered": true,
    "human_reference_attested": true,
    "source_native_time_independently_verified": false,
    "automated_collection_authorized": false,
    "has_source_message_payload": false,
    "verification_status": "UNVERIFIED",
    "editorial_status": "PENDING_INDEPENDENT_RESEARCH",
    "scoring_eligible": false,
    "commercial_eligible": false,
    "public_published": false
  },
  "official_evidence_candidates": [
    {
      "publisher_family_claim": "example-treasury",
      "original_publisher_url": "https://treasury.example/press/100",
      "published_at_claimed": "2026-10-10T19:10:00Z"
    },
    {
      "publisher_family_claim": "example-central-bank",
      "original_publisher_url": "https://centralbank.example/news/200",
      "published_at_claimed": "2026-10-10T19:12:00Z"
    }
  ]
}
~~~

Note: the example reference and domains are invented and will not produce a real verified event. Do not use example data for customer intelligence.

Execute locally:

    node scripts/build-telegram-manual-research-review.mjs --input /private/manual-review-input.json --output /private/geomacro-review-packet.json

The output and input **must both be outside the repository**. The output is a new private owner-readable file, never overwritten and never printed. You may use 0–6 candidate URLs to accumulate evidence. The script neither follows URLs nor tests publisher independence.

## Strict output invariants

- status=PENDING_INDEPENDENT_FACT_CHECK
- corroboration_verified=false
- independent_publisher_ownership_verified=false
- reviewer_final_approval=false
- original_article_dates_verified=false
- source_rights_verified=false
- source_native_time_independently_verified=false
- scoring_eligible=false, signing_eligible=false, commercial_eligible=false, public_published=false, x402_chargeable=false
- Does not include Telegram channel handles, raw text/media or Telegram post URL.
- No analyst-supplied free-text news headline, claim or severity, to prevent laundering publisher messages into structured product.
- No network, secrets, database, commercial-side effect.

## Separate automation paths

The existing authorized publisher Bot webhook and B2/D1 lead-queue consumer are independent from this offline human research track. Do not use the webhook consumer or generic canonical flash ingest to accept manual research packets, or change publisher_authorized, activation, TELEGRAM_PRODUCTION_DEPLOY_ENABLED or payment gates on the basis of a research reference. A green CI result certifies these fail-closed contracts only, not real-time collection or commercial publication.
