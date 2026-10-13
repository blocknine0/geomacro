# Issue #2170 — Full 535 governed discovery-root scan without 535 new requests

## Why

The existing 90-minute governed-source probe inspects up to 40 roots at a
time and rotates all three categories fairly (PR #2168). Previously an
individual green run was wrongly easy to read as whole-registry coverage.
Root HTTP reachability also does not establish a feed, active original-item
ingestion, publisher rights, GEO risk scoring or a sale.

## Newly added bounded 14-slot audit

`scripts/lib/governed-root-rotation-census.mjs` validates the exact root
catalog, the 14 slot indexes, the source SHA refs and checked results in
the earlier SHA-only Actions receipts. A claimed full audit requires all
535 distinct catalog roots, with no missing/duplicated/forged source ref.

`scripts/ops/collect-full-root-rotation-census.mjs` reads existing source
intake GitHub Actions artifacts (read-only, under GITHUB_TOKEN) and never
contacts the original websites. It reads at most 40 successful recent
source-workflow runs and stops when all 14 unique slots have receipts.
All receipts must be no more than 48 hours old and within their actual
90-minute slot. The collector uploads only a 2-day aggregate with per-domain
checked/HTTP-reachable/degraded counts and an SHA commitment; no
source IDs, names, original URL or feed content.

Daily best-effort audit: `.github/workflows/source-root-full-rotation-census.yml`
at 23:48 UTC, or manual `workflow_dispatch`; first main push also runs one
bounded acceptance. GitHub schedule delay/skips may leave an incomplete
audit: that is correctly `PARTIAL_HTTP_ROOT_CENSUS_PENDING_WINDOWS`, not
proof of unavailable original publishers or a 195-country outage.

## Single canonical endpoint stays

`GET /api/v1/intelligence/query?view=source-status` already projects the
three-category original-publisher D1 observation (PR #2169), and
`POST /api/v1/intelligence/query` remains the existing paid x402 contract.
Full discovery-root census is internal operations metadata, not exposed
to a customer/browser and not evidence licensing or commercially payable.

## Issue acceptance truth

This repair enables independent replayable 535-root *HTTP transport*
coverage without new provider GETs. It does **not** activate 535 publisher
feeds, verify the 1,059 inventory references as real fresh producers, or
change per-article rights, raw-source privacy, user payment, B2 or D1.
To close #2170, inspect actual completed 14-slot producer artifact,
then separately inventory each true active feed and original publication
freshness, quarantined/denied provider, Telegram authorizations and live
deployed single GET. Do not close solely on CI unit-fixture success.
