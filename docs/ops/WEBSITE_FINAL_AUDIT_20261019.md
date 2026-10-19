# Public website and pricing audit — 19 October 2026

Owner instruction: cross-check Geomacro public website against GitHub and fixed pricing, repair confirmed issues, add visible Home navigation and improve Intelligence. This is explicit approval for the scoped presentation update; the independent Global Risk final presentation remains unchanged.

## Observed production baseline

The production build marker was `5a6fc8c01715e93da736ea5f89d202ef9607dd88`, matching main when this audit began. All 14 principal public documents returned HTTP 200 with document title and main heading: Home, Intelligence, Risk Indices, Ask, Data API, Institutional, Pricing, Contact, About, Research, Docs, Roadmap, Ecosystem and Global Risk History. The root homepage existed; explicit Home navigation was missing.

The pricing API exactly matched the canonical catalogue: eight capabilities, fourteen variants, USDC strings and atomic amounts. No prices changed. Structural country digest remains 0.02 USDC (20000 atomic units). A live free Ask test completed with a dated ECB daily reference, its evidence and a warning that reference fixes are not executable live FX prices. This does not certify every Ask topic or paid checkout.

Intelligence showed 68 original-dated prior findings and none in the preceding 24 hours during inspection. These are observed dated records, not a current event or global-country coverage claim. Signed-product deep health returned 503; public document health and free findings do not replace signed-product readiness or merchant acceptance.

## Repairs

- Explicit Home links on desktop, mobile and footer; exact root active state.
- Critical Minerals discovery links to its actual Intelligence category, rather than Global Risk History. Ask footer Risk Indices points to the correct page.
- Compact two-column desktop / single-column mobile Intelligence newsroom, country/topic search, original-publication 24h/7d/30d filter, category deep link, twelve findings per increment and expandable context. Invalid, future and expired publication clocks remain excluded. Required publisher credits/licences remain intact; generic limited-detail releases are labelled honestly and never become scores.
- Failed category checks stop indefinite loading; manual refresh checks the journal too; duplicate overlapping journal requests are bounded.
- A healthy empty homepage poll retains a bounded eligible in-tab finding without extending its native 30-day expiry. Removed duplicate sales cards from the hero; the shared sitewide access guide still states actual availability and Coming Soon monthly checkout.
- Pricing UI markers are generated directly from the unchanged canonical catalogue. A manual read-only crosscheck verifies fourteen public pages, Home navigation, Intelligence filters, all UI/API price variants and the exact published revision. It makes zero Ask/payment/publisher calls and does not promote signed or merchant readiness.

## Validation and acceptance

Focused website, freshness, source-rights, pricing, continuity and presentation regressions: 31 files / 158 tests passed. Production Vite build passed. Subsequent final checks and GitHub checks must also pass before merge. Website-lock baseline is explicitly advanced for this owner-approved scope while retaining the independent Global Risk lock. Production acceptance requires running `EXPECTED_SHA=<merged-main-sha> node scripts/ops/verify-live-website-contract.mjs` on the actual published site; a merge alone is not live deployment proof.

Remaining commercial gates are separate: genuine fresh approved signed inputs for all required signed-product domains, exact live deep-health recovery, merchant wallet/facilitator/provider verification and settlement reconciliation, and separately authorized actual purchase/delivery evidence. This audit neither spends funds nor fabricates those acceptances.

## Deployed candidate visual follow-up

The merged website revision passed all 4310 Product CI tests, all ten PR workflows, main Product CI and Lovable mirror sync. Its read-only deployed candidate passed the fourteen-document, Home/filter and exact fourteen-variant UI/API pricing parity crosscheck. Browser acceptance confirmed twelve findings initially, twenty-four after Show more, nine Sudan matches, an honest empty last-24h view and three Critical Minerals findings from the category deep link. Home navigation resolved to the actual homepage after its loader completed.

Visual inspection also found that the isolated candidate could not serve two existing Lovable-hosted public images. The follow-up deployment fix copies the exact public owner logo/background into the candidate asset binding at build time, validates PNG type, metadata length and pinned SHA-256, and routes their existing public URLs through that binding. Both images must verify before writing or deploying; no runtime production proxy, private binding or image redesign is added. Deployed acceptance independently checks both hashes. Seven offline candidate fence/asset tests cover corruption, HTML rejection, partial-output prevention and unchanged write/auth/payment rejection. Production publication still requires exact-SHA acceptance separately.
