# USGS MCS 2026 country coverage — exact 195 baseline (2026-10-18)

The existing rights-checked hash-pinned, CC0 2026 USGS MCS derived-only
country digest previously routed only USA and CHN. This change reuses the
approved canonical 193+2 country ISO3 registry for **exact** first-party
country name matching in the source-native CSV. If a country name in the
USGS file is absent, spelled differently, has no 2024/2025 comparable
critical-mineral production series, or cannot satisfy the existing strict
hash/rights checks, the customer gets no eligible data.

No alias guessing, unsupported territory mapping, new upstream sources,
source timestamp invention, number extrapolation, raw source export, GRI
score, signed GRO, B2/D1 write, payment or Supabase activation. The
country registry is a **routing universe**, never a country coverage claim.
All current source/rights, annual-window and commercial x402 gates stay
unchanged.

Acceptance: existing `qualified-mcs-country-digest.server.test.ts` covers
new ISO3 routing, exact-only matching, ambiguous names, unknown country
and legacy USA/CHN behavior, via Product CI. A live provider hash/rights
readback and actual buyer deliverability still require separate acceptance.
