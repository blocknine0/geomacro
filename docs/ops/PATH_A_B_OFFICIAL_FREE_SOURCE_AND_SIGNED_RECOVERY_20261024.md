# 2026-10-24: three-category free original-source recovery and independent GRI status

## A. Verified official publication endpoints, without bypassing evidence gates

These are the publisher's own **advertised** freely retrievable feed URLs,
not verified real-time delivery or blanket commercial-use licenses:

| Category | Existing path | Newly connected/resilient source | Allowed identity |
| --- | --- | --- | --- |
| Geopolitics | UN Geneva and UN press / first-party FCDO / eligible GOV.UK | EU Council of Ministers original press-release RSS `https://www.consilium.europa.eu/en/rss/pressreleases.ashx` | `www.consilium.europa.eu/en/press/press-releases/YYYY/MM/DD/<slug>/` |
| Macro/FX | ECB press `https://www.ecb.europa.eu/rss/press.html`, BIS, BoJ, BoC, Fed, GOV.UK | **Same ECB publisher** `https://www.ecb.europa.eu/rss/statpress.html` only if press RSS transport/5xx fails | existing ECB exact original paths; **not** a second independent original |
| Critical Minerals | official UK/Canadian/BC/Australian/IEA feeds | U.S. DOE official general news RSS `https://www.energy.gov/rss/energygov/2193718` (already used in free-source and website pipeline) | `www.energy.gov/(articles|cmei/articles|em/articles)/<slug>` |

Official human-readable publisher pages:
`https://www.consilium.europa.eu/about-site/rss/`,
`https://www.ecb.europa.eu/home/html/rss.pl.html`,
`https://www.energy.gov/cmm/critical-minerals-and-materials-program`.
**These publisher pages were externally inspected; source-runner transport and
source-native clock acceptance must be demonstrated by actual GitHub main
workflow.** Do not represent these as current commercial data just because
the institution advertises RSS.

All connectors run through the SAME canonical 195-country/three-category
discovery, exact pinned issuer host/path checks, native item RSS publication
clock, strict exact first-party page publication clock, article byte readback,
country-topic relevance, explicit 403/429 hold, a bounded overall **12 GET
discovery budget**, quota-governed private B2 pre-review storage and no funds.
The strict source parser does not trust RSS update time, discovery index
seendate, source URL hash, future publisher clocks or off-host redirects.
No alternative credential, bypass of a provider restriction, unverified
discovery item or paid API is introduced.

Rights require real scrutiny:
- EU Council website reuse permits reproduction under conditions including
  source acknowledgement, unchanged message and disclosure of changes. A
  product with no end-user attribution must not assume it meets those terms.
- U.S. DOE is a government issuer already used by the public website and the
  free-source updates; third-party material can remain restricted. No blanket
  article or commercial-use rights grant is coded.
- ECB statistical and general press sources remain one institution; two
  feeds cannot count as two independent same-event originals. Free access
  does not amount to commercial license proof or source data freshness.

## B. Latest actual signed publication state (2026-10-23)

* [Original intake #40018773134](https://github.com/blocknine0/geomacro/actions/runs/40018773134):
  KGZ, 12 source requests; native dated feed entries observed but **zero
  country-matched qualifying page candidates** and zero exact byte proof.
  Degraded network: zero for that run. Country/provider/topic selection and
  genuine original issuance, not default network failure, were immediate
  blockers.
* [D1 hot root cause #40019489285](https://github.com/blocknine0/geomacro/actions/runs/40019489285):
  D1 diagnostic HTTP 200 but the three public products each HTTP **503**,
  `HOT_SNAPSHOT_STALE_OR_INVALID`; original metadata age approx 20,263
  minutes Intelligence, 21,499 Global Risk, 22,475 Risk Indices.
  Historical GRI anchor exists in D1 but original B2 history was NOT
  independently read back. `signed 3/3` is **not** met.
* [Commercial no-funds #40019489198](https://github.com/blocknine0/geomacro/actions/runs/40019489198):
  build/discovery 200, Deep Health 503, paid availability 422 and deployed
  SHA parity false; **no payment**. Never turn health green artificially.
* [Standing consent #39991090542](https://github.com/blocknine0/geomacro/actions/runs/39991090542):
  existing Pallab/Suman one-time GRI policy consent enrolled and
  cloud-derived-only ran; machine review reported
  `SKIPPED_NO_VERIFIED_CURRENT_ORIGINAL`. This is not current
  independently human-reviewed numerical GRI.

**Path B remains EXACTLY the externally independently reviewed GRI v1.2
contract**: two truly independent original publishers making the same event
claim, genuine source-native times & full byte verification, independent
Facts/Rights signatures for article-specific legally derived-use sources,
three-domain current canonical score + counterevidence, Suman's cryptographic
review of exact numerical input and each genuine country/category certificate,
Pallab's separate time-bound hash approval, read-back pinned historical GRI
gzip, current B2 immutable review bytes, D1/read-model and Risk Indices
continuation. No existing standing derived-only approval is misrepresented as
a human future GRI signature.

## Full acceptance (never fake)

For each category, demonstrate an actual independently verified **current**
original in private original intake and a valid source-rights disposition.
Then:
1. Human/independent signed exact source facts/rights and three separate
   matched country/category certificates are genuinely issued as required.
2. Independently reviewed 3-domain scored current GRI package created and
   signed by Suman, explicitly hash-approved by Pallab.
3. Existing strict offline `verify-pallab-suman-independent-handoff.mjs
   --validate-offline-no-funds` with exact historical B2 source bytes passes.
4. Protected private immutable B2 stage and canonical GRI publication pass,
   actual public readback GRI and Risk Indices are fresh.
5. Intelligence, Global Risk, Risk Indices all prove current signed 3/3;
   deep health returns actual HTTP 200, production SHA matches main,
   representative paid product is genuinely deliverable with no funds.
6. Separate **explicit owner real-money ACK** is necessary before any 0.005–
   0.15 USDC x402 settlements. No test invoices are charged.

No country has a guaranteed hourly geopolitical, central-bank and minerals
event. `NO_CURRENT_QUALIFYING_EVENT` is a truthful successful source
examination outcome where nothing qualifies, not an outage or invented event.
\n## 2026-10-24 actual post-merge host acceptance\n\n[main original intake #40021850893](https://github.com/blocknine0/geomacro/actions/runs/40021850893)\ncontinued to yield zero current country-matched qualified originals for KGZ;\nit did not exercise the USA DOE selector.\n[main stateless acceptance #40021850932](https://github.com/blocknine0/geomacro/actions/runs/40021850932)\nshowed the newly inserted USGS Minerals News RSS as `http_4xx` and no\ncurrent 24h qualifying mineral signal (`rare_earth` 0), even though\nother first-party feeds worked. USGS was therefore disabled in the shared\noriginal RSS registry and the **existing DOE RSS used by the free-source\ncollector and public stateless reader** was wired in its place, preserving\n35 configured update sources and the original-GET budget. New publisher\nstill needs actual first-party article/native timestamp/rights proof.\n