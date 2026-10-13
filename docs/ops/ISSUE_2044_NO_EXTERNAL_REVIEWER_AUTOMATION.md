# #2044 — No external reviewer available: bounded Geomacro machine-evidence path

**Founder constraint (2026-10-13):** There is no independent human reviewer available.
This must not stop open source discovery or private automated candidate pairing.
It must also never silently downgrade the existing third-party
reviewer-attested/FEDERICO_STRICT or x402 commercial contracts.

## Already runnable without a reviewer

The source-normalized private evaluator is:
`scripts/ops/evaluate-machine-same-event.mjs`

It reads one bounded JSON payload from **private stdin**, uses the existing
`clusterPrivateIndependentEventCandidates` module, and emits only a compact
private hash/counter verdict (no URLs, publisher identities, original text,
article bodies, user questions, keys or cost-bearing operations).

Input schema: `geomacro.private-normalized-original-candidates.v1` containing
`candidates`, each already normalized by the real original-publisher ingestion
pipeline. It reuses the same registered-publisher host, native original
publication timestamps, identical structured claim hash, distinct authoring
organizations, distinct article-content hash, anti-syndication and
retraction/contradiction checks. It does **not** fetch any new article. If the
upstream source flags are forged, this program cannot discover that; hence it
emits a **candidate**, not a source-authenticated commercial artifact.

Run only on a private trusted host/pipeline after original source intake:

    node scripts/ops/evaluate-machine-same-event.mjs < /secure/private-input.json

Do not copy /secure/private-input.json to GitHub, stdout, Actions artifacts,
issue comments, public D1 or website code. The JSON record is private and
should be made ephemerally from real, checked source pages.

A true two-original structural match has status
`TWO_ORIGINAL_MACHINE_MATCH_REQUIRES_SOURCE_AUDIT` with
`independent_external_review_completed:false`,
`licensed_commercial_source_rights_verified:false`,
`publisher_article_readback_verified:false` and
`x402_payment_authorized:false`.
The match is not a second credential, legal-rights receipt, AI-judge truth
claim or a signed GRO.

## Reviewerless commercial model — separate future acceptance

An entirely Geomacro-operated derived-intelligence service can potentially
sign its OWN findings, **provided** independently authored original sources,
source authenticity and original dates, same-event identity, counterevidence,
source-specific lawful commercial use/attribution, severity derivation,
canonical GRO signature and x402 no-funds receipt are genuinely verified.
It must say *Geomacro automated cross-source verification*, NOT
*independently audited by an external reviewer*. Source independence is
not an independent reviewer's sign-off.

That distinct commercial proof version is **NOT** enabled by this change.
Until its own full production and legal acceptance, this candidate verdict
cannot make `/api/health?deep=1` return green, issue a signed commercial GRO,
promote a D1 hot snapshot or authorize any USDC settlement.

Leave the independently reviewer-signed qualifier intact for partners who
explicitly require it, notably FEDERICO_STRICT. No third-party reviewer exists
at this time; an appointment or signed receipt must never be fabricated.

## Next production data acceptance

- Use **two real distinct original reporters of one precise event**, with
  publisher-native publication time and original article readback.
- Verify source rights and attribution compatibility independently of
  a mere copied registry status; a raw article is never customer output.
- Produce a separately versioned **Geomacro-machine-attested** GRO path,
  independently replay its hash/signature and run no-funds commercial
  acceptance before any change to x402 entitlement. It must not masquerade
  as the strict independent-reviewer receipt.
