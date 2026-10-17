# Direct publisher to Geomacro structured observations

The existing Ask original-release engine now has a direct-publisher profile:
official RSS/Atom, first-party APIs and original article pages. This profile
does not contact Telegram, GDELT, ReliefWeb discovery or World Bank annual
statistics. It does not need a Telegram session or a new paid API.

`POST /api/v1/intelligence/live-structured` accepts an exact country/category
request using the same engine as Ask:

```json
{"country_iso3":"GBR","category":"critical-minerals","lookback_days":7}
```

Country routing supports the canonical 195 states. Categories are
`geopolitics`, `macro-fx`, `critical-minerals`. Default lookback is one day;
an explicitly requested 1–7-day window is returned unchanged in the response.
Routing support is not proof that fresh evidence exists for every country.
Each request has at most 12 discovery GETs and four original-page checks.
Exact country/topic, first-party origin and original publication date must
match. Missing/stale/future original evidence returns 422 without a charge.

The output uses the existing Geomacro vocabulary for finding, change and
why-it-matters. Raw headlines, original article text, source URLs, private
evidence and publisher IDs are not returned. Fetch time never replaces a
native original-publication timestamp. The website keeps its 15-minute delay;
this live API can use an already verified original immediately.

These are free, unsigned, unscored research observations. Publication-clock
verification does not certify a real-world effect, independent corroboration
or source commercial rights. This request does not issue an x402 quote,
change locked capability prices, sign a GRO, write intelligence snapshots or
authorize settlement. Existing reviewed numerical/category-only requests and
the separate legacy B2/D1 health contract retain their behavior.

The no-secrets acceptance workflow reads actual original publishers for one
bounded GBR/three-category sample, verifies pages and generates the actual
API JSON in memory. It saves counts, original publication times and customer
JSON hashes only. At least one genuine derived category output is required;
success is never all-country coverage or merchant/payment acceptance.
