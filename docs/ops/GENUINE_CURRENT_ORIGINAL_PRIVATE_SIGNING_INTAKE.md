# First genuine original → PRIVATE signing review intake

This is **step 1** of signed commercial recovery. It creates actual, source-native
publisher HTML **byte proof** for an *unreviewed factual lead* when and only when
a current publisher original exists. It is **not** a rights approval, human
factual review, Ed25519 issuer signature, independently corroborated event,
reviewed GRI input, signed GRO, hot snapshot or payable x402 product.

## Always-on, zero-subscription intake

`.github/workflows/current-original-private-signing-intake.yml` runs
best-effort four times daily, and can also be manually dispatched. Default
country rotation uses all 195 canonical ISO3 codes through the existing
02:17 / 08:17 / 14:17 / 20:17 UTC slots, four distinct countries/day
and a 49-day source-probe cycle (195 runs). This is NOT 195-country
current factual coverage: each candidate still needs new real publisher
releases, verified HTML bytes, native timestamps and separate review.
A manual dispatch can specify any canonical 195-country ISO3.

Exactly one existing canonical three-category discovery run is shared across
the categories: max **12** direct-publisher discovery GETs, **3** original page candidates
(up to **6** GETs including pinned first-party precision APIs), and **3**
independent exact HTML byte readbacks (up to **6** GETs), per execution.
The total cap is **24** source GETs. B2 remains under the existing six-request
shared governor; there is no new cron or API subscription.
Neither a third-party aggregator, article URL hash, website first-seen clock,
feed `updated`, nor B2/D1 restore time can become an article byte proof.

The current original must be within the protected **22-hour source verification window**; country/category
relevance is grounded in the canonical source reader and is still reviewed
by the authorized facts custodian. The unclaimed-page verifier does NOT make
up a canonical WHO/WHAT/WHERE/WHEN event to satisfy the scored contract.

Action receipts contain ONLY aggregate counts and no private original URL,
article title, raw source bytes, HTML hash, source identity or signing
material. If no qualifying original exists, the receipt says
`NO_CURRENT_BYTE_VERIFIED_SOURCE_FOR_REVIEW` rather than generating a fake
input. **Current genuine verified review leads are retained in the EXISTING
private B2 bucket** with per-request D1 shared quota admission, exact
compressed upload/full-body readback and SHA/gzip restoration. Public job
logs/artifacts contain only category counts and boolean storage status:
the private B2 object key, full compressed SHA, upstream publisher, URLs,
titles and article bytes never appear there.

There is no B2 request or client for a zero-lead intake. If quota is held,
credentials are unavailable or B2 readback fails, the job fails closed and
must NOT claim a durable handoff. Owner-authorized custodians retrieve the
date-partitioned `geomacro-evidence/v1/private/original-pre-review/YYYY/MM/DD/`
objects using their *already-scoped* private B2 read credentials; do not
expose object contents to public GitHub artifacts or the website. The
retained lead is explicitly **not** a reviewed GRI input, an approved
Facts/Rights grant, or a country/category certificate.

## Local authorized operator handoff (optional; private key never needed here)

On an authorized private workstation, or separated trusted issuer runner,
create a private directory **outside the repo** with mode `0700`. A real
current official page is required: a sample fixture is never uploaded.

```bash
mkdir -p /secure/geomacro-first-party-review
chmod 700 /secure/geomacro-first-party-review
GEOMACRO_REVIEW_COUNTRY_ISO3=USA \
GEOMACRO_PRIVATE_REVIEW_DIR=/secure/geomacro-first-party-review \
GEOMACRO_PRIVATE_REVIEW_EXPLICIT_SAVE=YES \
bun scripts/ops/prepare-first-original-signing-input.ts
```

The operator-only JSON (mode `0600`, exclusive create) includes exact
official article identity/URL/title, original HTML SHA256 and independently
verified publisher-native publication time, plus **explicit false** rights,
signing and commercial fields. This is a signing **review lead**, not a signed
machine-intelligence input. It is NEVER accepted by the signed B2 publisher.

Next, the owner-authorized facts custodian must inspect the actual article,
its semantic WHO/WHAT/WHERE/WHEN identity, corrections and relevance, and
the separately authorized rights custodian must verify the particular
article's genuine no-attribution commercial derived-use scope, including
third-party material. These must issue independent Ed25519 attestations on
the exact canonical facts/rights proof using *their own private keys*.
Only the existing governed, signed `machine-intelligence-current` input
contract may proceed to production after its own proof/rights checks.
One original cannot silently satisfy the existing two-independent-original
GRI v1.2, Risk Indices or strict machine-commercial scoring contracts.

No Supabase, paid data API, wallet interaction, payment, new signing service
or key upload is done. Only genuine verified pending leads can use the
existing protected, quota-governed private B2/D1 handoff.

## Verification

```bash
node --test scripts/lib/private-original-signing-review-intake.test.mjs
node --test scripts/lib/geomacro-original-page-readback.test.mjs
```

See the GitHub Actions receipt for **real** pre-review leads found on a given
run. If it reports zero, the work is still provisioned and safe but there is
no genuine fresh qualified article/signature to claim.

## What this permanently fixes, and what it does NOT

The earlier schedule lost source-identifiable verified pre-review lead records
when the hosted runner exited: a genuine byte-verified original found by a
private intake did not reach a custodian. The protected main job now
*privately retains* each available lead with exact immutable B2 readback,
using the same B2/D1 quota governor as current signed producers. Source-free
receipts state one of:
`NO_GENUINE_LEADS_TO_ARCHIVE`,
`GENUINE_PRE_REVIEW_LEADS_PRIVATELY_ARCHIVED`, or
`SHARED_B2_QUOTA_HELD_NOT_ARCHIVED`.
A quota-held genuine lead causes the main job to fail instead of silently
claiming successful preservation.

This does **not** make the 195×3 sources verified, increase Backblaze provider
free caps, or produce original articles where none were released. The
first-party page readback still requires genuine publisher HTML/native
clocks; Suman still requires separately lawful Facts/Rights evidence,
independent current GRI numerical scoring, same-event original corroboration,
and reviewable unsigned GRI/certification JSON. A genuine signature must
follow that real review and an owner signature after Suman. Deep Health
may remain 503 until independently published 3/3 exact B2/D1 signed products
exist. No raw source delivered to customers, no Supabase and no funds.


## Explicit authorized private export for Facts/Rights custodians

The GitHub receipt never reveals the private B2 key. In the existing private
Backblaze bucket console (not a public PR) an already authorized custodian
can locate the current date under
`geomacro-evidence/v1/private/original-pre-review/YYYY/MM/DD/`.
On the owner's **private workstation**, not GitHub Actions, supply the
specific object key and an absolute new JSON output file in an existing
0700 directory outside the checkout. Use existing restricted B2 read
credentials, Cloudflare quota/DB credentials and the existing global governor:

```bash
export GEOMACRO_PRIVATE_ORIGINAL_ARCHIVE_KEY='PRIVATE_B2_KEY_FROM_OWNER_CONSOLE'
export GEOMACRO_PRIVATE_ORIGINAL_EXPORT_PATH="$HOME/geomacro-private/pallab/genuine-pre-review-unique.json"
export GEOMACRO_PRIVATE_ORIGINAL_EXPORT_ACK=YES_NO_FUNDS
export B2_ACCOUNT_QUOTA_REQUIRED=1
export B2_ACCOUNT_QUOTA_WORKFLOW_ID=original_review_export
export B2_REQUEST_BUDGET=3
# B2_KEY_ID, B2_APPLICATION_KEY, CLOUDFLARE_ACCOUNT_ID,
# CLOUDFLARE_API_TOKEN and D1_DATABASE_ID are the existing SCOPED
# protected credentials; never echo them, commit them or paste into chat.
node scripts/ops/export-private-original-review-lead.mjs --authorized-private-review-no-funds
```

This strict owner-private export verifies the object key's compressed SHA,
gzip, full original-lead JSON canonical recomputation and the producer's
actual source-native article clock. It writes only a 0600 file, no overwrite.
The stdout receipt has aggregate count, country and boolean verification;
never private original URL, article title, hashes or file path. Do not
export if no genuine verified source lead was retained. The output still
contains only **unreviewed** original page identity and SHA metadata,
not the source HTML body and not a GRI/country certificate.
Facts and Rights custodians separately open the actual upstream original,
check legal scope and issue their distinct genuine signed proofs. Suman
independently reviews the canonical three-domain numerical GRI package
AFTER those prerequisites; an original pre-review lead is never
`GEOMACRO_SUMAN_UNSIGNED_GRI_PATH` or
`GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH`.

## Safe publisher-page failure diagnosis after a successful source-discovery run

The page-verifier already accepts first-party article HTML ONLY when its
precise original publisher date is independently established, the exact
article/source identity matches, and issuer feed clock agrees. A country
can have `original_candidates_by_category.geopolitics=1` and still have
zero published originals. Prior receipts reported only
`ORIGINAL_PAGE_OR_NATIVE_DATE_UNVERIFIED`, leaving the concrete source
repair impossible without accessing private article details.

The protected intake now opts into bounded `page_rejection_counts`, which
the receipt publishes as `discovery_funnel.original_page_rejection_reason_counts`.
It contains ONLY coarse fixed enum counts:
`PUBLISHER_PUBLICATION_METADATA_MISSING`,
`PUBLISHER_PUBLICATION_TIME_IMPRECISE`,
`PUBLISHER_PUBLICATION_METADATA_CONFLICT`,
`PUBLISHER_PUBLICATION_DATE_INVALID_OR_EXPIRED`,
`ORIGINAL_FEED_AND_PAGE_CLOCK_MISMATCH`,
`INDEX_HEADLINE_OR_PAGE_IDENTITY_MISMATCH`,
`FIRST_PARTY_SOURCE_ACCESS_DENIED`,
`SOURCE_FETCH_TRANSPORT_OR_MIME_FAILURE`, plus issuer-specific/scope
failures. No article title, URL, publisher, HTML body, native date or hash
is added to the receipt. Invalid codes, impossible counts and attempts over
the strict four-page budget fail closed.

If `PUBLISHER_PUBLICATION_METADATA_MISSING`, use a real additional issuer
original-publication metadata verification contract, not a guessed hour,
crawl time, indexed time or current timestamp. If
`ORIGINAL_FEED_AND_PAGE_CLOCK_MISMATCH`, check exact first-publication
versus feed `published` with the original publisher and fix source
mapping only from genuine issuer-native evidence. If `ACCESS_DENIED`,
respect legal/provider access controls and use separately authorized source
alternates, never a 403/429 bypass. An empty evidence day correctly has
zero GRI signatures, no invented GRI country certificates, zero B2
original-review PUTs and no paid quote.

This diagnostic is a troubleshooting aid only, not a new production
approval and not the missing fully automated numerical GRI policy profile.

## GOV.UK issuer-original precise clock rescue (all three categories)

The 2026-10-23 GBR protected discovery located one real geopolitical
original article candidate, but **zero** actual native original clocks and
zero exact HTML SHA proofs. GOV.UK sometimes displays just a calendar date
in its HTML, while its **same-publisher** Content API provides genuine
`first_published_at` for that exact article. The free website news reader
already used Content API as an original-publisher timestamp; the private
review-eligible verifier previously did not.

For pinned `https://www.gov.uk/government/{news|speeches|...}/{slug}`
articles in ANY of the three categories, when and ONLY when original HTML
publication metadata is missing or day-only (not contradictory/stale/future),
the verifier may spend ONE additional counted `https://www.gov.uk/api/content`
GET. It requires exact original `base_path`, issuer document type,
first-party Content API title matching the HTML H1 and discovery headline,
a precise timezone-bearing `first_published_at` no older than the original
22-hour verification window, and no redirects. This issuer precision is
rechecked alongside the *actual original HTML bytes SHA* during private
pre-review lead intake. All GETs consume the SAME 12 discovery, 4 page/API
and 2 byte-stage/API request caps; no quota increase or bypass is allowed.

Safe receipts separate original-page attempts from actual first-party issuer
network-request counts. These counts do not reveal URL or publisher names.
No Content API timestamp may backdate a changed article. `public_updated_at`,
fetch time, website display time and slug date are never original publication
time. A different source of the same article does not produce a second
independent original. Zero valid publisher-native events still produces
`NO_CURRENT_BYTE_VERIFIED_SOURCE_FOR_REVIEW` and no private B2 write.

This FIXES the documented missing evidence path for existing UK FCDO,
DBT, Treasury and energy/minerals publisher candidates **when their
real Content API returns an exact matching clock**. It neither proves
every such current original exists nor guarantees all 195×3 country-domain
cells have a new event within 22h. Private first-party original leads remain
UNREVIEWED and NOT commercially billable. Numerical GRI/certificates
still require two distinct real same-event publishers, exact Facts/Rights
licenses and signatures, independently verified historical B2, genuine
per-batch human review (or an explicitly *different* audited automated
numerical profile), and protected publication/readback. The already enrolled
Pallab+Suman one-time automated policy only authorizes **derived-news
policy audits**, not false new human reviewer signatures.

## Three-category recovery capacity

Current review discovery now uses the existing direct-publisher entrypoint,
which supplies category topic scopes and reserves original issuer search
slots. Annual macro references and third-party index discovery cannot consume
this current-original budget. A required source attribution can prioritize a
PRIVATE original review; the credit is preserved and never becomes a rights
waiver or a public no-attribution product.

The three page candidates and three exact rereads select one per available
category before newer duplicates from one category. Each phase budgets the
HTML and optional pinned original-clock API separately. Previously two
rereads and a two-lead private archive could never retain all three categories
in one run; a single precise GOV.UK proof could consume the entire byte-stage
budget. The same archive now accepts at most three pending leads. No reviewer,
Facts/Rights, independent corroboration, signed score or hot-publication gate
is waived. Empty or unsupported country/category results remain unavailable.
