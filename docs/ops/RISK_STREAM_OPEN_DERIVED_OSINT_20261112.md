# Hot 50 Open Derived OSINT — production-safe first phase (12 Nov 2026)

## Contract

This change adds **open structured facts and targeted single-source search**, not an
override of the independent-original production commercial verifier. It does
not change migration 0214 in place (0214 is already deployed), unlock payments,
rewrite commercial rights, or remove the protected canary hold.

- Existing 20-minute `riskGapEnrichmentTick`: a cell that yields just one
  publisher domain sends at most one targeted Google News RSS request, excluding
  the first publisher. Response is metadata/URL only and is marked
  `SEARCH_INDEX_LEAD_ONLY`; it cannot sign or certify a source.
- `risk-stream-open-search.mjs`: bounded network input, no redirects, a
  domain-exclusion search with a 48-hour query horizon, short timeouts and
  per-event deduplication. The Google RSS index is NOT an original publisher.
- `risk-stream-open-derived.mjs`: strict country membership in canonical 195,
  publication/event clocks within 72 hours, typed factual event identity,
  source host and role validation, original-publisher endpoint proof, source
  ownership independence, both sources within 48 hours and category role pairs.
  Fact identity is derived from (country, category, type, entity, location,
  quantitative impact, event time) rather than title hashes.
- Only factual tokens and source metadata are admitted into the open-derived
  candidate output. No publisher article body is stored or redistributed.
- `rights_tier: DERIVED_FACTS_OPEN_INTELLIGENCE` is a scope label, **not**
  a licence and not by itself commercial permission. Missing attribution,
  reviewed terms, original publisher evidence or third-party source restrictions
  are HOLD. FRED is case-by-case (series owner and API terms); Yahoo Finance
  must not be auto-approved for commercial market pricing.
- GeoMacro may sign an `open-derived-osint.advisory.v1` with its research
  Ed25519 key. The payload explicitly disallows customer delivery, charging,
  certified GRI, execution and reinterpretation as migration-0214
  independently rights-attested original proof.
- Basic research requires at least one accepted observation, Standard research
  two independently verified same-event facts; Complex research a genuine
  seven-consecutive-UTC-day Ed25519-verified, private R2 readback-backed
  history. The pure tier function evaluates **supplied** signed history; no
  production history is automatically created by this PR.
- **No production commercial Standard/Complex promotion** occurs until a
  separate reviewed authority path validates issuer terms / factual identity,
  persists private immutable D1/R2 receipts with verified readback and clears
  the ordinary protected release gates. `risk_stream_signed_gro` remains
  subject to the existing two independent machine attester signatures and
  source rights checks.

## Open source role equivalents

| Requirement in migration 0214 | Free-source example | Authority |
| --- | --- | --- |
| GOVERNMENT_WIRE | White House / State Department | U.S. federal original only |
| INDEPENDENT_REGIONAL | CBC / DW | Reviewed publisher-derived facts only |
| OFFICIAL_STATISTICS | BLS, Census, Federal Reserve | Native issuer, third-party content excluded |
| MARKET_PRICE | Federal Reserve original statistical exchange/rate releases | Native issuer and exact series checked |
| TRADE_CUSTOMS | U.S. Census international-trade releases; USITC | Native issuer, not USGS geology misclassified as customs |
| INDEPENDENT_INDUSTRY | Mining.com / Mining Weekly | Terms review required; no copyrighted prose |

FRED API's terms expressly do not override third-party series rights.
USGS and BLS designate federal-authored material generally public domain
with third-party exceptions. These source policies should be reviewed before
commercial launch:
- https://fred.stlouisfed.org/docs/api/terms_of_use.html
- https://www.bls.gov/bls/linksite.htm
- https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits

## Test versus production proofs

`node --test scripts/tests/risk-stream-open-derived.test.mjs` uses
**synthetic offline fixtures** for 4 geopolitics, 3 macro, and 3 minerals
event pairs. The 10/10 offline contract verifies algorithmic behaviour only:
it proves **zero** live original publications, production D1 source-rights
approvals, genuine publisher licensing, real 7-day immutable R2 history,
or `SHADOW_AUDIT_PASS`.

The protected workflow `risk-stream-shadow-provider-audit.yml` keeps its
original independent facts/rights requirement and isolated D1/R2 readback
acceptance unchanged. Never reroute these synthetic fixtures into it.

## Remaining end-to-end implementation

1. Review legal terms and owner/license proofs per source and dataset. Treat
   publisher accessibility as insufficient for commercial entitlements.
2. Implement source-native extraction/clock verification for real originals
   (including revision/retraction handling); search hits only enqueue candidates.
3. Persist qualified *derived-facts* records in an additive migration with
   idempotent per-event keys and bounded queue-free decision read path.
4. Sign and archive genuine seven-day D1/R2 history with independent readback,
   and connect separately reviewed commercial entitlements.
5. Deploy only under existing protected Stage2, quota and zero-traffic canary
   checks. Run real provider-backed shadow acceptance without fabricating PASS.
