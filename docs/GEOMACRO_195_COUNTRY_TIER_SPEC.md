# 195-country structural and live coverage tiers

Implementation: PR #2837. Canonical country registry is the existing 193 UN
members plus the Holy See (VAT) and Palestine (PSE). **Do not invent a country
tier from routing alone.**

## Structural country tiers

Every country is evaluated against exactly four independently governed
structural-country-digest preflights, each with the same source-native date,
commercial rights, observation, original subject and module evidence
eligibility used by the existing x402 availability engine:

- `geopolitical_security` (Geopolitics)
- `macro_monetary` and `external_fx` (Macro/FX)
- `critical_minerals` (Critical Minerals)

`S0`: four tested, zero eligible modules. `S1`: exactly one eligible
module. `S2`: at least two eligible, but not all three domains. `S3`:
at least one eligible module in each of the three domains.
If one or more module runs are unavailable or fail data contract checks,
`structural_grade=null`, `structural_grade_status=RUNTIME_UNAVAILABLE`.
A separately labelled observed floor can still be displayed, but **never
marketed as a complete eligible S tier**.

Each module returns only its name, status from ELIGIBLE/STALE/NOT_ELIGIBLE/
NOT_CONFIGURED/RUNTIME_UNAVAILABLE, actual evidence `as_of` when known,
and a fixed reason code. Observation period remains null unless the
same governed paid preflight exposes its actual source-native period.
Unknown is never numeric zero.

S-grades are UNSCORED and do not themselves grant the specific product
or corridor eligibility. A buyer still must pass the actual selected
country/profile/corridor composition check, quote and normal payments.

## Live tiers

`L0`: no exact country-geography derived record in the available bounded
72-hour journal, not a guarantee that no international news exists.
`L1`: a matching 72h Geomacro derived news record (unsigned).
`L2`: current independently reviewed, verified and signed GRI/Risk Object;
this implementation **never assigns L2** because no such country proof is
verified by this route. If the D1 journal is down, live_grade is null rather
than an invented L0. Before claiming full L2 grade parity, a separate
production signed B2/D1 certificate reader must be integrated and certified.

## Existing API (additive)

- `GET /api/v1/intelligence/availability`: unchanged offer discovery,
  additionally contains `country_tiers_index` link.
- `GET /api/v1/intelligence/availability?view=country-tiers`: 195 registered
  countries and grade status `NOT_EVALUATED`, with null S/L and null
  grade counts. This is a *routing tier index*, not a fabricated national
  eligibility census.
- `POST /api/v1/intelligence/availability?view=country-tiers` with
  `{"country_iso3":"IND"}`: evaluate four exact country-digest modules;
  return S grade and L0/L1 from actual derived journal, with no charge.
  One country per request, bounded size, rate limited, read only.
  A 195-country tier distribution requires genuinely evaluating countries
  and the relevant sources; the index is not that distribution.

Current commercial prices, paid checkout, mainnet ACK, data rights, independent
GRI signing, Predge delivery, and the 72-hour news journal are unchanged.

## Acceptance

Test S0 S1 S2 S3, two modules in Macro/FX, right-unverified/stale and
future-observation exclusions, partial runtime-outage null, PSE/VAT, no raw
source identifiers, no payment headers or side effects, and 195 unique ISO3
names. Production acceptance separately needs current website deployment SHA,
actual governed preflights and live data; source inventory or green CI alone
cannot prove paid-ready coverage.
