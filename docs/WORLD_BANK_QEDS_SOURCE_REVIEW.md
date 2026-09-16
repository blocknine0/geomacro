# World Bank QEDS source review

**Status:** rights-verified external-risk candidate. Not active for paid Risk Gate scoring.  
**Reviewed:** 2026-09-16

## Exact source

- Provider: World Bank
- Database: Quarterly External Debt Statistics (QEDS), SDDS and GDDS/QEDS participation paths
- Frequency: quarterly
- Primary use in Geomacro: external-liquidity, foreign-currency, maturity and sector vulnerability evidence
- Production target modules: `fx_external_risk` and later versioned external-sovereign vulnerability modules

QEDS provides external-debt breakdowns by debtor sector, maturity, instrument and currency. Those concepts are useful for external vulnerability. They are not a substitute for general-government or central-government gross debt.

Official references:

- `https://datacatalog.worldbank.org/search/dataset/0038047/quarterly-external-debt-statistics-sdds`
- `https://www.worldbank.org/en/programs/debt-statistics/qeds`
- `https://datahelpdesk.worldbank.org/knowledgebase/articles/906519-world-bank-country-and-lending-groups`

## Rights boundary

The reviewed World Bank Data Catalog entry identifies the QEDS dataset as Public and licensed under CC BY 4.0, subject to the World Bank dataset terms and dataset-specific third-party restrictions. Commercial reuse therefore requires attribution and preservation of the exact source contract.

Geomacro must not infer that every World Bank-hosted asset has the same rights. Only the exact reviewed QEDS dataset/adapter path may inherit this candidate status. Raw source-payload resale is not authorised by this review; paid output remains governed derived intelligence with provenance.

## Methodology boundary

Production eligibility requires all of the following:

1. deterministic adapter with exact dataset/series identifiers;
2. preservation of debtor sector, currency, maturity, instrument, unit, period and reporting basis;
3. exact ISO3 mapping against `live_country_registry`;
4. source response or bulk-file hashes and retrieval timestamps;
5. source-specific peer universes where normalization is used;
6. unchanged freshness, minimum-peer and confidence thresholds;
7. no relabelling as total, central-government or general-government debt;
8. no cross-concept raw-value pooling merely to increase coverage;
9. source-state and commercial-rights gating before customer delivery;
10. a full country census and shadow comparison before any module promotion.

## Activation state

`production_activation_allowed=false`

`commercial_rights_candidate=VERIFIED_EXACT_DATASET_CC_BY_4_0`

The next implementation step is a no-write coverage adapter that measures fresh ISO3 coverage for selected external-debt structures and records exact source hashes. A large country count alone does not activate paid scoring.
