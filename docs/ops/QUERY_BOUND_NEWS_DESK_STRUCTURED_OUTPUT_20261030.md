# GeoMacro news-desk structured output from one original publication

## Scope

A newsroom-style brief is **derived from one eligible original-dated source observation** and tailored to the human/machine question. This does not assert that one upstream headline proves an event, market move, regulatory outcome, affected country or causal explanation. It must never pad the answer with generic repeated analysis.

### Real serving routes (no new sources/queues)

1. As soon as the existing governed D1 source journal contains an admitted native-dated release, `GET /v1/public/three-domain-structured-output` includes that item with an additive `news_desk` projection. The journal continues to return all three category keys, including explicit empty/reference-only categories. This is source-neutral **free observation JSON**, not a paid product.
2. For supported country-scoped questions, the canonical `POST /api/v1/intelligence/query` route and convenience `POST /api/v1/intelligence/structured-answer` keep the existing source-rights, native-date, commercial evidence, and x402 requirements. When the canonical priced product is not deliverable, the already-existing no-payment, no-signature original-page research fallback may return `geomacro.structured-answer.v1` with an additive `answer.news_desk`.
3. The pure `buildQueryBoundNewsDesk` focuses the direct answer on what happened, why/impact, market relevance or what to watch. It uses previously derived `what_changed` and `why_it_matters` and never fetches a publisher itself. Bengali/Hindi intent keywords are supported as bounded lexical hints; full translation/LLM factual inference is not claimed.
4. The same observed publication+derived fact is deduplicated across category lanes. Distinct events can still be retained in each category. Unknown direction, quantified price change, next confirmed date and independently verified affected-country impact stay `null`/false.

## Event-specific fields

- `what_happened`: single fact-grounded derived lede.
- `potential_implication`: separately derived uncertainty-preserving significance; null if indistinguishable from lede.
- `original_published_at`: original publisher clock, not retrieval time.
- `category`, `topic`, `requested_country_iso3`: explicit scope; publisher country is not assumed to be affected event country.
- `market_direction`, `price_impact`, `next_confirmed_event_at`: null until separately verifiable.
- `focus`, `direct_answer`, `unique_story_count`, `unresolved`: human/machine adaptive view, with the full source-neutral story structure.
- `chargeable:false`, `commercial_rights_verified:false`, `execution_authorized:false`: the research projection does not authorize sale, payment, trade or a signed risk reading.

## Acceptance/limits

- PR tests: one item returns direct specific answers; 3 categories produce distinct topic-bound outputs; duplicated cross-category facts are suppressed; source URLs/HTML fail closed; same-event corroboration and market direction cannot be invented.
- Existing paid output hash, x402 quote, replay, price, signing and entitlement logic are unchanged. This is **not** a new paid SKU nor a reason to relax a 422.
- Actual paid launch still requires per-product original evidence, rights, signed proof if applicable, owner-authorized mainnet payment and a real customer response receipt.
- Existing ingestion, D1/B2 quota governor, 72h observatory, PREDGE setup, historical-data storage and website presentation remain untouched.
- A quiet publisher or missing country/article means an explicit evidence gap, not a synthetically generated news update.
