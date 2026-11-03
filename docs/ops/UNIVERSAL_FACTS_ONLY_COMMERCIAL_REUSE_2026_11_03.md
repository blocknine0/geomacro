# GeoMacro universal facts-only derived intelligence policy (v1)

This policy applies to **every source family** used for discovery (public news and RSS, government and central banks, ReliefWeb, GDELT Project metadata, Telegram/private OSINT and direct corridor feeds). A source may generate a **private unverified signal** without establishing the event, licensing the original article or authorizing a paid risk decision.

## Non-negotiable boundaries

- Customer-facing commercial content is GeoMacro-authored **verified factual events, reproducible numerical risk indicators, independent risk advice**, never the source article, a verbatim paraphrase, copyrighted image, publisher database or full original feed. Private provenance metadata is a separate retention-controlled research layer; this policy does **not** falsely claim all pre-existing private D1 records are raw-text-free.
- Source access, systematic extraction, rate limits, database rights and provider contractual restrictions apply **even to facts**; a news feed or public URL is not itself an unrestricted commercial data licence.
- An unlicensed/noncommercial article may be a discovery trigger **only where its actual access/use terms allow that processing**. Its title, body and copyright claim are never laundered into a commercial licence.
- Verify the same event independently with a traceable primary official document (its issuer, timestamp, content hash, allowed licence, exclusions, and attribution) or two independently authored open-data sources. A GDELT CAMEO code alone is **not** real-world incident confirmation or a verified severity score.
- GDELT **Project** datasets explicitly permit commercial use **with project citation**: https://www.gdeltproject.org/about.html. This must not be confused with the separate GDELT Cloud product, which has different commercial terms. A GDELT dataset permission does not license the underlying publisher's copyrighted article text.
- OGL v3 may permit commercial reuse with attribution; it expressly excludes unlicensed third-party materials: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/.
- U.S. Copyright Office: facts are not protected by copyright, although expression is: https://copyright.gov/help/faq/faq-protect.html. This is not global immunity from contracts, database rights or copyright claims (EU Database Directive: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex:31996L0009).

## Enforced decision states

Shared guard: `resolveDerivedCommercialEligibility()` in `scripts/lib/official-original-issuer-rights.mjs`:

1. `HOLD_SOURCE_ACCESS_OR_EXPRESSION`: restricted terms, prohibited extraction, copied text, unrecorded attribution, or uncertain permitted use.
2. `PENDING_INDEPENDENT_FACT_VERIFICATION`: source signal exists, but primary/independent evidence, native event time, ISO3, event identity, licence and independently bound factual hash have not all been verified.
3. `PENDING_INDEPENDENT_SCORE_AUDIT`: independent facts are verified, but mathematical score has not been independently audited against those exact facts.
4. `DERIVED_FACTS_COMMERCIAL_CANDIDATE`: independently sourced facts and original reproducible score are eligible **as a candidate**; the separate commercial launch switch, PREDGE constraints, rights review, Ed25519 GRO signing, purchase entitlement, x402 and paid Risk Gate still have to pass their own independent gates.

All four states return `storeRawText:false`, `publishOriginalArticle:false`, `paidDeliveryAuthorized:false`, and `signedGroAuthorized:false`. No new candidate changes customer/payment execution by itself.

## Implementation and monitoring

- The existing on-demand original-article research path now annotates private candidate records with this disposition; without independent facts, it cannot be promoted to paid products.
- Additional producer-side and delivery-side integrations are tracked separately; until these are instrumented and live verified, do **not** claim every producer has been switched or that all historical data obeys the new rule.
- A truly completed acceptance requires: one independent issuer-evidence readback, same-event match and immutable hash, proof of rights/attribution, no original article leakage in customer response, reproducible independent numerical scoring, signed GRO and a production paid dry-run/real entitlement that passes existing commercial gates. No fake evidence or forced `commercialEligible:true` values.
