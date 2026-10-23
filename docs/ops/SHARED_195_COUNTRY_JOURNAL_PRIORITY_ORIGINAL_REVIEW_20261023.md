# Same 72h Intelligence journal -> focused private original review (no funds)

## Why

The canonical 195-country / three-category matrix is complete as **routing**, not certified live source coverage. The four daily scheduled original signing-intake slots previously selected their one country by a 195-country rotation only. The real 2026-10-23 Malawi intake scanned 210 publisher-feed items, only one country mention, zero topic matches, and zero original-page readbacks. Blindly adding more paid engines, source scans or pre-approving titles would not fix this.

## Existing-data reuse

The scheduled `Current Original Private Signing Review Intake` reuses **the exact same bounded 72h D1 derived-news journal** as Intelligence, Ask Geomacro and the no-charge canonical API. It looks only at already-published, source-neutral, unscored, exact-native-date country mentions within 22 hours (15-minute original embargo intact), mapped to one of the existing 195 ISO3 countries.

- Select one recent country lead, prioritizing multiple distinct three-domain observations, cycling across the most recent 12 exact-country candidates.
- Re-query that country through the **existing** protected three-domain direct-publisher original engine, within the existing 12 source GET / 4 page / 2 exact HTML reread ceiling.
- Manual `country_iso3` dispatch is unchanged and does not query D1 to pick a country.
- D1 outage, only day-precision news, source-attribution requirement, stale or unclassified news: fall back to the original canonical 195-country rotation.
- Canonical six-continent 195-state sweep remains separate; this prioritization is an **additional discovery-efficiency improvement**, not evidence of 195 countries with live signed releases.

No second database, no Supabase, no new 195-country source polling loop, no private article delivery and no extra payment or signing workflow. The extra 1–3 D1 GETs are bounded and read-only and do **not** count as originating-publisher proofs.

## Trust boundaries

A journal hint never becomes a verified original, a legal grant, a different originating publisher, a current GRI score, a certificate, a Facts/Rights signature, a GRO, x402 eligibility or a customer charge. The only output additional to the pre-existing sanitized receipt is the selected country ISO3 and coarse selector status/candidate-country count. No upstream URLs, publisher/title, article HTML or private hashes.

Production signed Intelligence, GRI v1.2 and Risk Indices remain unavailable until actual independent signatures, B2 SHA/gzip readback and current D1 public promotion pass. Health must remain 503 when those conditions fail; prelaunch payments stay OFF.

## Validation

`bunx --no-install vitest run scripts/ops/prepare-first-original-signing-input.test.ts src/lib/priority-original-review-country.test.ts`

The existing workflow CI also runs exact original-byte tests, issuer constraints and 195-state scheduler contract tests. After merge inspect the post-merge workflow's `country_selection_mode`, `discovery_funnel.next_required_gate` and publisher-stage counters, then pursue actual original-page verification for the selected country.