# Source-by-source commercial-rights remediation, 21 October 2026

## Correct obstacle and operating choice

Geomacro owns its **own** eligible derived output but does not own a publisher's source article, images, database rights or separate contractual license. Publicly readable ≠ commercially redistributable. No trusted component may create missing third-party permission by setting `approved=true`, inventing a signed receipt or inferring silence.

The current paid source-private/no-upstream-names policy **cannot assume** compliance with a source's legally required attribution. CC BY 4.0 permits commercial reuse *with attribution*. If owner chooses to offer an attributed separate product in the future, it needs an explicit contract and compliant credit mechanism. Existing source-private paid endpoints are NOT silently changed.

USGS states its USGS-authored/produced information is US public domain and credit is *requested*, not a blanket license for third-party graphics/photographs. For USGS data, an exact **USGS-first-party original** can be placed in the fast rights review queue. It still needs original bytes/native timestamp, no third-party contamination, correct source identity and an authorized, distinct Rights signature before the machine commercial GRO gate opens.

Reference licensing texts:
- CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- USGS Copyright/Credits: https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits
- U.S. Copyright Office on facts versus expressive works: https://copyright.gov/help/faq/faq-general.html

Facts may fall outside copyright in certain jurisdictions, but contractual restrictions, sui generis database rights, site terms and any actual source-specific reuse may still matter. Thus `FACTS_ONLY` is an analytically separate product route, **not** permission to copy or resell a publisher's article.

## New automatic, conservative rights triage

`scripts/lib/commercial-rights-remediation.mjs` now enumerates EVERY current entry in `scripts/commercial-source-rights-evidence.mjs`, categorizing them into:
- `POTENTIAL_FIRST_PARTY_PUBLIC_DOMAIN_ITEM_CHECK` for exact USGS-produced information (third-party exceptions require verification).
- `OPEN_LICENCE_CREDIT_REQUIRED_OR_EXCEPTION_REVIEW` for sources where any mandatory upstream attribution conflicts with the existing no-public-source-name contract.
- `EXACT_DATASET_TERMS_AND_ARTICLE_SCOPE_REVIEW` for remaining narrowly governed datasets.

For per-item candidates, the triage enforces six-hour native-clock freshness, source+category identity, exact SHA256 original and same-event claim, third-party material exclusion and deduplication by issuer/article or issuer/claim. It emits a bounded next-action code, not a legal conclusion.

No two articles from the **same issuing organization describing the same claim** count as independent originals. An unknown source, reused syndicated wording, expired event or wrong category is not silently upgraded. Third-party contamination is routed for exclusion/recheck. Every receipt explicitly reports:
`per_article_commercial_permission_verified=false`,
`rights_signature_issued=false`,
`paid_api_authorized=false`.

When real article-scope rights are needed, `draftExactItemPermissionRequest` generates a **not-sent** letter requesting explicit non-exclusive commercial use of Geomacro original structured analysis, no raw article copying and, if needed, a specific waiver of upstream public attribution. Neither a draft nor a non-response is a grant. Owner/license holder must actually agree.

## Weekly free, bounded source-terms recheck

`.github/workflows/commercial-source-rights-drift.yml` runs once a week, on an explicit dispatch, or for code review. It fetches only current official terms endpoints from the **existing vetted rights register**, with:
- strict HTTPS hostname allowlist, redirects disabled, 13-second timeout,
- 192 KiB source-body maximum, batches of three,
- SHA256 digest of actual original terms bytes and per-source status,
- GitHub artifact retention 30 days; no raw article/credentials/partner data,
- no B2/D1/Supabase writes or payments,
- **zero automatic license promotions or signatures**.

Redirect, 403, change, oversized or unavailable terms is `REVIEW_REQUIRED`, not an automatic publisher license revocation or renewal. The owner can compare successive manifests and choose/attest a new scope if legally appropriate. This is source-contract **monitoring**, not real-time article licensing.

## Existing production GRO interface intentionally unchanged

The existing `geomacro.automated-commercial-proof.v1` contract already requires:
1. Two independently authored first-party SAME-EVENT articles, exact HTML/native clocks/hashes, claim/counterevidence checks and no retractions.
2. A separate article-scoped permission record for **each** original satisfying actual derived-only no-attribution commercial use, and a distinct Rights Ed25519 signature.
3. An independent Facts Ed25519 signature over the **same** proof.
4. A third pinned GRO signer, real private evidence and B2 exact readback before D1 hot promotion.

None of those private keys, permissions or original web pages is generated by a status monitor. This PR intentionally cannot turn historical/expired GROs into current signed production objects.

### No-guess execution path

1. Run the weekly source-terms audit and inspect the artifact for each source's reachable terms evidence. Consider any changes a review task.
2. Supply private, genuinely current original candidates to the per-item triage; dedupe. Prioritize directly first-party public-domain official material for eligible no-attribution fact extraction. Fetch independent first-party same-event issuer evidence as required by the signed GRO contract.
3. Route any attribution-required source to a **separate consent/waiver** request or future deliberately attributed product; do not remove credit in paid data. Use permitted simple factual claims in a separately governed unscored research pathway where contracts/jurisdiction permit.
4. A trusted rights process examines exact terms and verified original scope, records the genuine permission record and signs it. The distinct facts issuer signs genuine event facts; only then may the third signer generate a fresh production GRO.
5. Verify actual B2 readback and D1 promotion; test Risk Gate with dedicated bearer, no-funds and `execution_authorized:false`. Predge research remains independently active during rights reviews.

**Acceptance scope:** all current registered source rights are triaged and periodically monitored, and no missing license is faked. 195-country/three-category full commercial rights, hands-free legal approval, universal 20-minute freshness, signed current GROs and paid readiness are **NOT certified** by this engineering work.
