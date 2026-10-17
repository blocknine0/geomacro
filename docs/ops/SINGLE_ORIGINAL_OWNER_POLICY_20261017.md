# Geomacro founder rule: ONE verified original source per factual finding

Effective 2026-10-17. Supersedes the earlier mandatory TWO independent originals requirement **for the factual-evidence candidate**, while protecting distinct legacy reviewed multi-source risk scoring and legal delivery contracts until a separately verified single-source commercial profile is approved.

## Founder-approved one-original intake

One genuine **first-party original article** with exact publisher allowlisted HTTPS article URL, original unmodified HTML bytes SHA-256 (NOT URL hash), a verified source-native publication clock, approved country/category identity, and bounded six-hour currentness is sufficient to qualify ONE **source-verified factual observation candidate**. The claim must be plainly labeled `SINGLE_ORIGINAL_FACTUAL_EVIDENCE_VERIFIED_RIGHTS_PENDING`. Its independently corroborating issuer count is `0`. No second issuer, same-event matching or invented duplicate is required to issue this candidate.

Official original read-back: `verifyGeomacroSingleOriginalPage` (separate `geomacro.private-single-original-page-readback.v1` schema) and `verifyGeomacroSingleOriginalBinding` (separate `geomacro.private-single-original-binding.v1`). They reuse existing registered publisher URL pin, native date parser, exact original HTML byte hash. Legacy `verifyGeomacroOriginalPages`, `verifyGeomacroTwoOriginalMachineBinding`, the existing external reviewer contract, and `FEDERICO_STRICT` remain unchanged with their actual two-or-more-source constraints.

## What the owner did NOT waive

- An original that can only show a calendar date, a feed-index time, unknown publisher or stale HTML still cannot be marked genuinely current with a precise timestamp. Do not invent hour/minute or refresh an older article's clock.
- No **commercial no-attribution grant** is inferred from factual validity. Rights custodian must still inspect actual article-specific public-domain/exemption or genuine rightsholder permission, hash original licence/grant document bytes, and verify attribution requirements. CC BY/OGL/EBRD materials do not silently become attribution-free.
- No exception to facts AND rights signing under distinct pinned Ed25519 authorities, separate GRO signer, source registry controls, full exact hash/readback and no-funds preflight.
- One original proves ONE issuer's statement; never set `independent_claims_verified=true`, `independent_original_issuers_verified=true`, `corroboration_status=CONFIRMED` or `independent_source_count=2`. Distinct single-original risk/paid source contracts must visibly label single-source provenance and revised confidence rules, and pass independent production acceptance BEFORE use.
- Do not feed a single-source receipt to the current 2-source canonical risk scorer, Federico strict scoring, independent reviewer publisher, three-domain GRI certificates, B2 hot production or x402 settlement. Old trust gates remain intact until a separate audited one-source commercial ingestion/scoring/publisher profile is built.

## New rights stage

Call `checkGeomacroSingleOriginalRightsPreflight` with exactly one private verified candidate. It rereads first-party bytes and source-native clock BEFORE any B2 commercial rights registry GET, then verifies the same source ID/issuer association and B2 category/licence status. It ALWAYS returns `actual_article_commercial_permission_verified:false` and cannot create any signature/GRO/publication. A compatible registry row means only `B2_REGISTRY_COMPATIBLE_SINGLE_ARTICLE_PERMISSION_PENDING`, never paid eligibility.

## Practical KAZ/WBG result

The actual independent readback found World Bank original press-release body SHA256 `48f4316534443486ccdeb1c96de0e6f987e305fc893ac5e50f433957edb257c3` and Kazakhstan government HTML SHA256 `0b11e02a3e04e829263655dd86030ab0778088c91b1b477effb54c776c6d0937`. Under the NEW one-source founder policy, either can be independently considered alone for **factual source evidence** — only after its actual precise source-native publication clock and article bytes are verified. The current live readback returned `source_native_publication_at:null` for BOTH, so NEITHER is genuinely current qualified proof under the six-hour clock gate. Kazakhstan public CC BY 4.0 and World Bank press release no-attribution licensing remain unresolved.

## No-cost path to genuine one-source commercial use

First obtain one legally eligible first-party original with actual native precise time. Inspect and approve scoped no-attribution commercial article reuse from the actual holder. Use the existing separate offline facts/right custodians, with a **new separately labeled single-original attestation profile**; the v1 two-source MachineCommercialProof must not be misrepresented as one-source. Build and test the new canonical scorer/delivery contract with honest source count=1, non-corroborated confidence/risk handling, signatures, B2/D1 current product hash readbacks, zero funds. The verified free/open-data `/api/v1/intelligence/live-structured` endpoint already returns one-source unscored observations where source rights/attribution support it and must remain honest.

## Safety

No new paid API, no Supabase, no fabricated event/rights, no private signing keys in CI, no old current snapshot timestamps changed, no x402 payment authorization. Master recovery #1827 remains open pending real eligibility, distinct authority signing, B2/D1 and deep-health 200.