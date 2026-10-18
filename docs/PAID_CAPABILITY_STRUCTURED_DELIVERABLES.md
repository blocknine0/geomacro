# Geomacro USDC capability pricing — structured fields per paid variant

**Canonical sources:** src/lib/capability-pricing-catalog.ts (locked prices), src/lib/capability-structured-output-contract.ts (14 variant output contracts). These are promised shapes for **qualified successful delivery**, not assertions that all products are currently available.

**Discovery:** GET /api/v1/pricing supplies structured_delivery per priced variant on Base, Arc and Polygon nonpayable previews. GET /api/intelligence/capabilities?view=outputs supplies all 14 field specifications. The official AI Agent discovery/OpenAPI references the same capability specification.

| Capability | Variant | USDC | Included structured Geomacro-derived output |
| --- | --- | ---: | --- |
| gri_read | verified_cached | 0.005 | Current verified global index snapshot ID, as-of, index score, coverage, proof hash, verification status and methodology. |
| gri_read | verified_change_attribution | 0.01 | Verified index state + proven comparison with prior state, direction/delta and driver attribution where available. |
| structural_country_digest | standard | 0.02 | One ISO3 country: compact source-native structural dimensions, derived metrics, observation count and age, limitations; no GRO score. |
| structural_corridor_digest | standard | 0.05 | One ordered country-to-country corridor: qualified structural relationship, source-native timestamps, direct/composed evidence and methodology; no invented route. |
| structural_country_profile | standard | 0.03 | One country's governed multidimensional structural profile, coverage, method and bounded history if verified. |
| structural_corridor_profile | standard | 0.08 | One directional corridor's wider verified structural context, composition evidence and bounded history/developments where genuinely available. |
| intelligence_query | focused | 0.05 | One subject/topic: answer status/headline, what changed/why, versioned state, freshness, product hash and limitations. |
| intelligence_query | standard | 0.10 | One subject with up to three topics: derived answer, current state, qualified modules, relevant developments, methodology and uncertainty. |
| intelligence_query | complex_multi_source | 0.15 | Qualified multi-topic/multi-subject/cross-domain analysis, comparison/ranking under a verified plan, relevant developments and cross-domain effects when proven. Risk Gate not silently included. |
| signed_risk_object | existing_valid_signed | 0.05 | Existing unexpired GRO subject, score, risk label/direction, confidence, attributed drivers, evidence summary, methodology, timestamps and signed-object integrity metadata (signature-byte verification is separate). |
| signed_risk_object | newly_qualified_signed | 0.10 | Same canonical attestation fields from genuine newly qualified evidence; signing and exact readback must pass separately. |
| risk_gate_bundle | existing_proof_preflight | 0.10 | One bounded policy/readiness decision using existing verified signed proof, reasoned preflight and no transaction execution. GRO proof included. |
| risk_gate_bundle | standard | 0.15 | One verified policy evaluation and its GRO, evidence context, disposition/reasons and proof; no separate GRO fee. |
| risk_gate_bundle | complex_multi_source | 0.25 | More detailed governed multi-source risk-gate assessment plus signed GRO, justified drivers and conditional cross-domain effects; no execution. |

## Machine response rules

Each spec exposes customer_receives (field paths guaranteed only after all eligibility checks), only_when_verified (conditional module detail), additional source/signing evidence prerequisites, subject_scope, response_kind and the commercial license. Null or missing data is never replaced with invented scores or movement.

Derived machine-readable JSON only: no raw news HTML, headlines, publisher names/URLs, upstream API exports, proprietary source archives, images or private storage keys. Owner's Geomacro Structured Intelligence Commercial License governs Geomacro-owned expression only; external source terms and attribution continue to apply.

**Commercial fail closed:** A listed price is not an available or payable offer. Signed/current product proofs, rights, exact SHA readback, verified answer preparation and ledger/x402 eligibility must all pass. Unavailable requests do not charge. No automatic price tier upgrade. Source-independent risk scores are never inferred from unscored source evidence.

Prices are identical on Base, Arc and Polygon native USDC discovery. Listing those networks does not authorize real settlement. Supabase remains frozen and no funds are enabled by these output specifications.
## Adaptive response metadata: never infer a price from the old flat launch offer

Newly assembled responses use `methodology.pricing_phase=CAPABILITY_USDC_V1`. When a genuinely verified quote's exact variant amount has not been supplied, `methodology.price_usdc=null`—not `0.05`. The original `EARLY_ADOPTION_10K` response phase is accepted by the JSON schema solely so exact older settled bytes can still be inspected/replayed. It does not authorize the historical flat schedule for new transactions.

Actual x402 prices must originate in `resolveGeomacroCapabilityPrice(capability,variant)` after full live source/rights/current-output qualification, and the payment adapter must revalidate the exact same amount before settlement. Catalog, preview or metadata alone never constitute a payable 402.
