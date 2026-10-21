# Automated AI research with no human external reviewer

**Owner intent:** Geomacro does not redistribute source articles. It delivers
Geomacro-authored country/domain-specific structured intelligence. A human
external reviewer is unavailable. Do not block the existing free derived-news
journal or independently authored factual summaries merely because there is
no external reviewer certificate.

## Two distinct trust profiles

### A. Existing factual/derived-only news — active

The existing `website-derived-news-continuity.yml`,
`five-minute-original-news-fastlane.yml` and `auto-ingest-news.yml`
publish the Geomacro-derived original-dated D1 news journal without demanding
external commercial-scoring reviewer signatures. The already implemented
`publish-website-derived-news.ts` emits
`raw_upstream_stored:false`, `commercial_rights_verified:false` and
`paid_delivery_authorized:false`; these flags remain **honest**.
Do not add an independent reviewer or article-licence gate to this **free
facts-only derived journal**. Publisher integrity, original publication
date, private source-reference provenance, and source-origin consistency
must still be independently checked before describing a record as verified.

A bare assertion that a feed is official or that output is structured does
not establish authenticity of every downstream claim. Maintain each
candidate's genuine issuer and exact original-content readback
state, retractions/contradictions and time-of-publication. Do not label
unrechecked records "authenticated original HTML".

### B. New Geomacro-internal AI-assisted research — private

Trust profile: `GEOMACRO_INTERNAL_AI_CROSS_CHECK_NOT_EXTERNAL_REVIEW_V1`.

A protected GitHub cloud workflow
`.github/workflows/ai-assisted-private-research-review.yml`
accepts an **existing** hash-pinned private B2 JSON under
`geomacro-evidence/v1/private/ai-review-case/<sha256>.json`.
The object contains only Geomacro-owned factual summaries of real native-dated
source observations, with a one-line proposed claim and **explicit
Geomacro-derived-only model transfer approval**. No raw source article,
URL/title, original quoted text, permission document or private key is sent
to third-party LLMs.

Two different previously configured providers (Groq, Gemini, Mistral,
Cerebras) review whether the derived observations support the proposed claim,
describe the same event and contain a material contradiction. Agreement is a
**research signal**, not proof of source identity, article licences,
independent original publishers, an externally certified GRI score, an
independently audited claim, or paid-product entitlement.

Owner-controlled explicit repository *variables* required:
`GEOMACRO_AI_REVIEW_DERIVED_ONLY_ACK=YES_APPROVED_DERIVED_ONLY`
and `GEOMACRO_AI_REVIEW_FREE_QUOTA_ACK=YES_FREE_TIER_CONFIRMED`.
Existing provider *secrets* (never output) are reused. The free-tier
declaration is not a billing guarantee; check vendor allowance before
authorizing these variables. Missing source case or quota denies without
calling providers. Max two model requests, bounded response tokens and
timeouts. The result is an immutable **private** B2 research receipt with
exact SHA readback and no public GRIs or actual x402 charge.

To dispatch a real case, the owner-authorized private evidence pipeline
must first make a genuine small, derived-only case and immutable B2 upload
with the repository's existing global D1 quota governor, approved auth
and SHA readback; then manual workflow_dispatch with SHA, or the existing
authenticated `geomacro_ai_derived_case_ready` repository dispatch.
A private case is never automatically invented from empty/stale D1 news.

## Factual copyright distinctions and limits

Bare facts are generally different from a publisher's copyrighted expression.
Source attribution, website terms, dataset/database extraction limits, access
conditions and jurisdiction-specific rights can still matter, even with
structured output. Therefore source-specific policy applies as relevant:
- no publisher text, titles, raw datasets, private source URLs or close
  paraphrase passed to the consumer or model;
- use independently authored, *new* factual synthesis, not a copied
  catalogue, subscription-only database extraction or restricted third-party
  article redistribution;
- use genuine approved origin sources and metadata, never automatically
  promote a provider label to all-source authentication;
- commercial-use provenance remains for **products whose actual legal scope
  or existing customer contract requires it**, especially licensed copied
  source material and externally reviewer-attested products;
- keep the existing canonical current paid Intelligence/GRI/Risk Indices
  independently signature-verified. Future Geomacro AI-attested paid
  eligibility needs its OWN reviewed/legal/product contract and no-funds
  acceptance; do not silently relabel the strict independent reviewer
  contract or make stale HTTP 503 synthetic 200.

No laptop needs to run 24/7. Existing official derived-news publication and
AI workflow run using GitHub Cloud + Cloudflare/D1 + protected B2.
