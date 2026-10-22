# Canonical 195-country / 3-category live-source coverage, without Supabase

## Canonical country denominator

The no-funds on-demand universe is **193 UN members + two UN observer states**
(Holy See `VAT` and State of Palestine `PSE`) = **195 country identifiers**.
The historical 250-area country/domain metadata ledger is a DIFFERENT geographic
denominator (194 sovereign ISO3 classifications, 53 territories, 3 special
entities including `PSE`). Thus the exact 195-country overlap is
**194 existing SOVEREIGN + PSE as SPECIAL_ENTITY**. The two registries must not
be equated, and neither makes Taiwan (`TWN`) a hidden 196th UN country.
The 55 additional geographic entries remain separately addressable where
explicit routing supports them; never silently call 250 "195 sovereign countries".

The existing D1 250 × 3 daily read-only source gap census now issues a separate
strict canonical 195 × 3 (585) coverage summary from **the same one D1 SELECT**.
It fails on registry drift, missing observer, unexpected classification, unknown
ISO3 or duplicate domain; the receipt stores only ISO3, domain and coarse
metadata blocker. Neither source-catalog entries nor fresh D1 metadata imply
a first-party original, current event, rights approval, signed GRO or
paid customer delivery. No new table, storage or Supabase requests.

## Bounded real country/category source acceptance

The existing `Live On-Demand Original API Read-only Acceptance` scheduled
workflow continues to use **one multicategory on-demand discovery** per country,
with at most 12 global discovery GETs and 4 original-page checks per country;
all three categories use the same retrieved evidence with issuer-specific
scope checks. Separate native dates, exact country relevance, source-rights
gates and no-money requirements remain unchanged.

The legacy **3 countries/day / 65-day source scanner** is now
**manual-only**. The existing daily global API acceptance remains scheduled,
but its old country batch no longer runs automatically. Six separate
continent source workflows have replaced it on protected `main`:

| Workflow / geography | Canonical ISO3 | UTC cron | Full nominal rotation |
| --- | ---: | --- | ---: |
| Africa | 54 | `4 */2 * * *` | 108 hours |
| Asia | 47 | `24 */2 * * *` | 94 hours |
| Europe | 45 | `44 */2 * * *` | 90 hours |
| North America, including Central America and Caribbean | 23 | `4 1-23/2 * * *` | 46 hours |
| South America | 12 | `24 1-23/2 * * *` | 24 hours |
| Oceania | 14 | `44 1-23/2 * * *` | 28 hours |
| **Total** | **195 disjoint** | **Six schedules, 20 minutes apart** | **Longest 108 hours** |

Africa begins 00:04 UTC, then Asia 00:24, Europe 00:44, North America
01:04, South America 01:24, Oceania 01:44, and Africa again at 02:04.
Every *same* geography repeats in 2 hours and selects its next canonical
ISO3. Every scheduled scan checks the same three Geomacro categories with
one bounded country source call (max 12 official discovery GETs plus 4
publisher page checks); no per-category duplicate scan. No meaningless
Antarctica workflow: 193 UN members plus PSE/VAT has no Antarctica ISO3.

Transcontinental assignments are fixed once for unique source routing:
Russia/Cyprus/VAT in Europe, Turkey/Georgia/Armenia/Azerbaijan/PSE in
Asia. This is a practical routing partition, not a formal geographic
or political jurisdiction claim.

The shared `continent-country-original-probe-reusable.yml` has no
cron, runs behind the six calls, keeps the same existing source verifier
and 9-minute job upper bound; global concurrency prevents simultaneous
source-heavy jobs. Runs superseded by GitHub queue limits remain
UNPROBED. A 108-hour *routing sweep* is not 195 fresh verified current
events; it is inherently too slow for a 24-hour global current-news SLA.
Real-time new qualified releases are collected via the separate
existing official-source fastlane/hourly derived D1 newsroom. The
country source probes do not themselves publish any derived article.
Current original identity, legitimate rights, independent signatures and
B2/D1 signed publication remain separate validation gates.

The country sweep does not need Groq and makes **zero Groq API calls**
for a country without a verified new event. If Groq is used later for
qualified news, it must first read verified native-dated original
article evidence, check the existing D1 duplicate identity and reserve
a shared free-tier quota slot. A Groq browser-search lead is not a real
verified original and cannot be promoted as genuine signed news.

The `Country 195 Rolling Original Proof Audit` executes **daily** on
the existing GitHub free tier without starting another source probe. It
aggregates exact bounded real success checkpoint artifacts retained for
90 days and checks the 585 country-category cells, 24h source-probe
recency, actual first-party country relevance and gaps. It separately
GETs the public website's own 72h D1 derived-news census once, checks
the literal 585-cell web response and reconciles observed geographic
headline mentions against truly verified source evidence. A source
probe and a website journal entry represent different underlying
questions and time windows: neither one upgrades the other to
licensed/signed country original. Zero news remains zero, not a
synthetic success. Missing provider, unsupported country, 401/403/429,
lack of native article date or no new events remain explicit.

A country cell is honestly **not observed / upstream restricted /
no qualifying original / country relevant / native dated /
rights-reviewed / independently corroborated / signed-delivered** according
to the actual stage reached. Annual official WDI values are valuable macro
structural context but are not newly published 24-hour event timestamps.
Holy See, Palestine and thinly documented countries may return
`NO_CURRENT_QUALIFYING_EVENT` or degraded provider status; avoid simulated
country events.

## Operational order

1. Route ISO3 and ISO2/approved exact aliases to the fixed canonical registry.
2. At question time try eligible local official issuers, then regional official
   issuers, then approved global discovery (GDELT index is not original),
   preserving per-source 401/403/429 and no-redirect/no-bypass controls.
3. Verify the first-party original date, article identity, country and category
   relevance and qualifying evidence. Only derive eligible original-news Finds.
4. For a country with no current event, return an explicit bounded no-current-
   evidence/degraded state rather than inventing a latest article or date.
5. Publish only the already approved, own-derived website findings to D1
   via the separate hourly bounded newsroom. Historical official numerical
   source series retain their own native time periods.
6. Preserve original-content rights, signing and verified hot publication gates
   for any commercial GRO/GRI/Risk Indices. Do not turn a green routing audit
   or the 250-area D1 census into signed readiness.

## Acceptance

Run `node --test scripts/tests/continent-country-195-rotation.test.mjs scripts/tests/country-195-daily-rotation.test.mjs scripts/tests/free-three-domain-country-gap-audit.test.mjs`. In GitHub Actions
inspect the six staggered country source `live-country-195-resume-*` artifacts and the
daily `free-three-domain-iso3-gaps-*` artifact. Exact-head Product CI,
CodeQL, the website lock and the real-source PR tests must pass before merge.
After merge verify protected-main 195-country receipt with **585** declared
cells and a current, independently true D1 readback for the *metadata only*.

Remaining conditions for truly certified worldwide commercial service:
current country-relevant original evidence and permissions where issuers
are accessible; reviewer/authority proof if required by the product;
signed current D1/B2 hot snapshots and real paid-product HTTP health.
Provider outages/rights restrictions and GitHub cron delays have no possible
unconditional 100% availability guarantee on free infrastructure.

## Full-world live evidence completeness limitation

No no-cost deterministic 2-hour-per-continent-country rotation can prove 195
countries with newly published events in all categories within 24 hours:
providers may be silent, rate limited or block access, and a complete 108-hour
source routing pass is older than a 24-hour current-news SLA. Customer on-demand queries still invoke worldwide original
discovery within the approved per-question budget. The daily audit
**monitors** proven gaps; it cannot invent an event, commercial-use
rights, a reviewer signature or force upstream publication. 585
configured route cells and 585 audited delivery cells are not 585
current signed event products. Honest no-result status is required.

CI acceptance: `node --test
scripts/tests/country-195-proof-rollup.test.mjs
scripts/tests/reconcile-country-195-publication.test.mjs`.
Daily protected-main acceptance additionally requires the actual
website API to return the 585-cell truthful journal and the rolling
original proof receipt to be fresh. No Supabase, source re-poll, B2
write or payment is introduced by that audit.
