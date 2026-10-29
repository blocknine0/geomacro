# Original Ukraine presidential news → geopolitical country evidence gap

29 October 2026. The official presidential website itself lists
`https://www.president.gov.ua/en/rss/news/all.rss` as its English original-news RSS
feed: https://www.president.gov.ua/en/subscribe/

## Reason
Production-target three-domain buyer diagnostic `40924639157` returned
`UKR / geopolitical_security / NO_PAYABLE_EVIDENCE`. Official government news
publication, country-specific event interpretation, an independently verified
geopolitical incident, its reuse rights, and a signed/payable Store module are
**five different proofs**. Registering another global outlet will not satisfy
them.

## Exact source intake
`scripts/ops/probe-ukraine-presidential-rss-original.mjs` reuses the existing
`collectRegisteredReusableNews` original-source parser, SHA-stable
ephemeral discovery logic, native RSS `pubDate`, topic filters and
bounded source transport rather than writing another XML parser. The source
is **one pinned first-party original publisher** with publication date parsed
only from the individual RSS item, maximum 192KB/7 seconds. The source is read
on the pre-existing 6-hourly owner-only no-funds workflow plus PR read-only
probes. Nothing is added to existing 512-endpoint global 15-minute source
rotation; no new cron, outbound payment, D1/B2, partner or Supabase I/O.

The sanitized receipt lists source family, publisher **location** UKR,
original native-dated keyword candidate **count**, latest verified source
publication timestamp *of a candidate*, and zero proof of commercial
source rights or geopolitical event location. Publisher country != country
described by a speech. RSS headline title, feed URL, full government text and
article URLs are **not printed**. Empty feed/topic, old timestamp, denied HTTP
or malformed XML remain explicitly observable and **unavailable**.

The collector's existing keyword rules are only a discovery heuristic and
cannot infer that every president's statement is an event. No first-party
item qualifies for `geopolitical_security` solely on this read; it still
needs event-specific precise origin, subject, relevance, independent
corroboration when product calls for it, usage rights, D1/B2 canonical
hash readback, official original publication clock and review.

## Acceptance
`node --test scripts/tests/ukraine-presidential-original-rss.test.mjs`
verifies single fixed issuer-host GET, native item date, stale/future/absent
date, 403/429/HTML/hostile XML, no unqualified category inference and
strict no-payment/no-PREDGE mutation. The GitHub Actions PR run performs
one genuine HTTPS probe, recording only measured state. Original live
publisher transport can be denied; no test or CI status converts a denial
into a successful original read.

## Remaining revenue blockers
UKR geopolitical paid Store `NO_PAYABLE_EVIDENCE` until independently
qualified actual observations and exact commercial terms/rights; BRA Macro
monthly 433 is also **source-only** until dataset rights and native clocks are
qualified; AUS/IND/USA Critical Minerals dataset produces a real **unpaid**
structural preflight, not settled USDC. D1 quota-held runs, true main
scheduled observability, B2 durable readback, independent x402 USDC mainnet
settlement and buyer acknowledgment remain separate.
