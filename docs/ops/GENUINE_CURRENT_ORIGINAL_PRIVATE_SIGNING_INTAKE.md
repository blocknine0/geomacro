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
the categories: max **12** direct-publisher discovery GETs, **4** native page
date checks and **2** independent exact HTML byte readbacks per execution.
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

No Supabase, paid data APIs, B2 write, D1 write, wallet interaction,
payment, new signing service or key upload is done by this intake.

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
