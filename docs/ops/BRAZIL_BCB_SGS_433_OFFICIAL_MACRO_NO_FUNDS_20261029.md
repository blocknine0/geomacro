# Brazil missing Macro/FX original-source route: BCB official SGS 433

**29 October 2026 — One official release-source candidate, NOT a commercial product**

The production-target three-domain zero-payment diagnostics on [run #40923656613](https://github.com/blocknine0/geomacro/actions/runs/40923656613) reported BRA `macro_monetary` as missing payable evidence. This is a **different** fact from the availability of an official monthly macro indicator.

Official publisher: Banco Central do Brasil, Sistema Gerenciador de Séries Temporais (SGS), monthly `IPCA` index series **433**. The fixed API route `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json` returns its own `data`/ `valor` observations. The BCB government [Open Data policy](https://www.bcb.gov.br/acessoinformacao/dadosabertos) supports reuse under open dataset-specific licence terms, which **may require attribution / database share-alike**. We have not verified no-attribution commercial derived-use rights for this exact series. Source presence is not equivalent to a publisher's original *publication instant* or independent commercial rights permission.

## Added no-funds original observation lane
- On existing 6-hourly first-earnings no-funds scheduled job (no new cron), make at most **one** fixed HTTPS GET and preserve only: Brazil ISO3, category, source family, count, **latest issuer-native MONTH reference period**, status and explicit denial of payable/billable/signed/news status.
- No date inference from retrieval, no interest-rate decision or current news claim. The API may supply day `01/MM/YYYY`, treated as **month identity**, not a source-publication timestamp. Invalid, duplicate, too-old/future and rate-out-of-bounds source rows are rejected. Hard 403/429/5xx/network errors never retry and never promote a candidate.
- Fetch is bounded to 8 seconds and 48 KB, requires JSON shape from the exact pinned official endpoint, no API token or card. No D1/B2/Cloudflare reads or writes, no Supabase, no new payments, no source-content output, no sensitive user questions.
- Existing `First Earnings Zero-Funds Live Acceptance` calls remain the same 3 country/category buyer preflights. **One extra official-source GET** occurs per scheduled 6-hour run and on matching PRs. It is best effort; GitHub scheduled ticks can be delayed or missed.

## Mock and real acceptance
`node --test scripts/tests/brazil-bcb-ipca-original.test.mjs` covers positive native month, deflation, revised/corrupt/duplicate/future/stale official data, 429/HTML/oversized, fixed provider origin, one request, never charge. PR GitHub read-only check may return `OFFICIAL_IPCA_SOURCE_UNAVAILABLE_OR_UNVERIFIED`; this is a *genuine provider availability failure* rather than eligible Brazilian commercial output.

## Unresolved before paid Brazil macro data
- Actual live official API response native reference and exact source terms / licence attribution review.
- Complete source-quality/rights review and canonical D1/B2 governed original evidence admission.
- **Only then** add a separately approved derived `macro_monetary` Store reader with original measurement period, scoped rights and paid preflight. Until then Brazil Macro/FX remains missing payable evidence and no billing is allowed.

This source observer never modifies PREDGE, x402, pricing, GRI/Risk Indices, canonical D1/B2 pipelines or historical data integration.
