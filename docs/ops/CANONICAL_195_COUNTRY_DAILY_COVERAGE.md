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

The index of the daily rotating slice no longer depends on
`GITHUB_RUN_NUMBER`, because push and PR builds can increment run numbers and
make the sampled-country selection skip arbitrary countries. Instead use one
deterministic UTC calendar period beginning 2026-10-17, 2 countries/day, with
a bounded 98-day sweep over all 195 canonical entries (last day has 1).
Days elapsed modulo 98 select the slice; repeated same-day reruns select the
same slice without skipping the next entry. Operator dispatch can explicitly
pin at most two country positions for targeted repair. Push builds run existing
representative live-source/country-routing acceptance only; no extra national
source fan-out. GitHub cron is **best effort**, so an actual missed schedule
creates a missing **live proof**. The mathematics of 98 planned slots does
not prove 98 successful network executions or 585 current official releases.

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

Run `node --test scripts/tests/country-195-daily-rotation.test.mjs
scripts/tests/free-three-domain-country-gap-audit.test.mjs`. In GitHub Actions
inspect the daily country batch `live-country-195-resume-*` artifact and the
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
