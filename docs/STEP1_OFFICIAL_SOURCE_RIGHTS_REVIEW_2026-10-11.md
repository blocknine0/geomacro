# Step 1 — Official original-issuer source-use review, 11 October 2026

**Scope:** feed use to discover first-party factual announcements for Geomacro's
Geopolitics, Macro/FX and Critical Minerals **private** research paths.
This is not an opinion that every item is commercially distributable.

## Stronger rights decisions (official notices reviewed 2026-10-11)

| Original issuing agency | Source | Official controlling public rights notice | Reuse decision for Geomacro |
| --- | --- | --- | --- |
| United Nations News | UN News peace & security RSS | https://www.un.org/en/about-us/copyright/ | News-related reproduction requires appropriate UN credit and advising UN. **HOLD article reuse until notice condition satisfied**; facts/private link metadata only; no media or bulk copying |
| UK Foreign, Commonwealth & Development Office | GOV.UK department Atom | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ | Crown-owned GOV.UK content under OGL generally commercially reusable with attribution; third-party rights excluded. Per-article copyright/exception validation required |
| U.S. Federal Reserve Board | Fed press RSS | https://www.federalreserve.gov/disclaimer.htm | Board-produced website information normally public domain with attribution; logos/seals/non-Board works excluded |
| Statistics Canada | StatCan Daily Atom | https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq | StatCan data open licensing, with attribution, third-party exclusions; per-item scope required |
| Natural Resources Canada | Canada federal NRCan Atom | https://open.canada.ca/en/open-government-licence-canada/ | Federal Canada-owned open data with attribution; third-party personal/IP exclusions; per-item publisher-owned check |
| UK Department for Business and Trade | GOV.UK department Atom | https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ | OGL for publisher-owned materials subject to exclusions, item review; this source is a separate institution from FCDO |
| U.S. Geological Survey | Minerals RSS | https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits | USGS-authored data public domain with credit; however **upstream transport unavailable/robot protection** on observed URL; never bypass, never mark feed working |
| Australia industry minister | Ministerial RSS | https://www.minister.industry.gov.au/copyright | **Only explicit general non-commercial unaltered reproduction rights**. Not licensed to commercialize article text; rights HOLD; factual observation only |
| EITI | implementing_country JSON | https://eiti.org/api | EITI API explicitly documents this route, but actual production HTTP 403. Do not bypass authorization, treat endpoint disabled until newly approved route; historical structural coverage is not new mineral news |
| NRCan Simply Science | Simply Science RSS | https://natural-resources.canada.ca/corporate/rss-feeds | Officially listed RSS, but observed transport unavailable / website also 429. No repeated requests/bypass. Alternative NRCan **news** issuer is independently verified, not a recovery claim for this path |
| EU sanctions / EU featured | European Commission or Europa news | https://commission.europa.eu/legal-notice_en | EU-owned content generally CC BY 4.0 with attribution/change marking; third-party assets excluded. Feed index isn't original same-event corroboration |
| ECB | ECB statistical press | https://www.ecb.europa.eu/home/html/disclaimer.en.html | Exact ECB rights must be evaluated before any article-content reuse; do not inherit EU Commission CC BY licence automatically |
| Eurostat | Eurostat catalogue RSS | https://ec.europa.eu/eurostat/help/copyright-notice | EU-owned datasets may be reused with attribution/third-party exceptions. **RSS 24h catalogue updates not current macro shocks** |

**Code:** `scripts/lib/official-original-issuer-rights.mjs` ensures the UN
notice condition cannot be casually presumed, and the Australian ministerial
feed can never inherit an open licence from an unrelated Australian
Government agency. Even an apparently open-licence issuer returns
`articleCommercialRightsVerified:false` and `commercialEligible:false`
until original publisher ownership, third-party exclusions, attribution,
article text, and downstream reviewer/checkpoint acceptance are complete.

## Step-1 acceptance — remaining evidence

1. Healthy independent source transport is necessary for each category;
   failing historical lanes may be *quarantined*, never silently marked 200.
2. For each true original item, verify **exact article URL**, first-party
   article publication timestamp (no feed updated/processing clock), actual
   affected subject country/countries from original text, and exact page
   licensing/third-party exception context. A title-only country co-mention
   does not prove an affected jurisdiction.
3. Record an evidence-linked item acceptance with reviewer identity and
   source/rights version. Without a fresh original item, source may be
   `WORKING_EMPTY`, but cannot be certified current scored intelligence.
4. Two distinct issuing agencies responding does **not** independently
   corroborate one factual event. Require semantic same-event check across
   independent original documents, not mirror/aggregation.
5. Raw articles are not customer products. All customer delivery is derived
   Geomacro risk objects after signed-GRO, verifiable B2/D1, and x402
   contract acceptance. Zero automatic grant or extra paid requests.

These are deliberately conservative engineering constraints, not legal
advice. Escalate licenses that exclude commercial activity or require actual
notice/permission instead of labeling them approved.
