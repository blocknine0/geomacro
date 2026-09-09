# Agentic Demo Launch Readiness

Status: internal technical-demo gate passed on Arc Testnet. This document does not declare a public production launch.

## Verified release evidence

Release candidate tested before merge: `3bee561ab69d2aea36347f730006944d85f0eb46`.
Merged main commit: `592f730e6fa546cf0eadbf80146e762d1020eaf1`.

Verified gates:

- Product CI passed, including app tests, Risk Gate static contracts, production build and generated route-tree drift protection.
- Database Schema Safety passed, including a full zero-to-current migration replay on disposable Supabase.
- Exact-head local and external HTTPS unpaid x402 contracts passed.
- One explicitly acknowledged `0.001 USDC` Arc Testnet x402 paid regression passed.
- Paid resource returned a signed persisted Risk Object and `REQUIRE_APPROVAL` while preserving `execution_authorized=false`.
- Isolated staging returned `NOT_CONFIGURED` structural context and `null` GRI when canonical verified context was unavailable. No synthetic or fallback score was introduced.
- Staging resilience testing passed with no server errors, timeouts, network errors or decision-boundary violations in the scoped test.
- Temporary staging port was returned to private and the staging server was stopped after testing.

## Public-release boundary

The browser `/demo` route remains a technical-demo surface and is intentionally excluded from the public sitemap. Search crawler access is blocked in `robots.txt` while the external Early Access package is being prepared.

Merging the technical implementation does not by itself mean:

- general production availability;
- an institutional SLA;
- third-party security certification;
- autonomous transaction authorization;
- custody or wallet signing by Geomacro;
- full route, logistics, counterparty or sanctions modelling;
- institutional pricing represented by the `0.001 USDC` x402 technical-proof price.

## Permanent decision boundary

Geomacro supplies signed external risk context and a policy recommendation. Customer or agent infrastructure controls any downstream execution. The current Risk Gate boundary remains:

`execution_authorized=false`

## Before deliberate external Early Access promotion

1. Confirm the deployed build is the intended current `main` commit.
2. Smoke-test the primary public surfaces: Intelligence, Global Risk Index, Risk Gate, Ask Geomacro, Data & API, Research and For Institutions.
3. Smoke-test the direct `/demo` link without adding it to the sitemap.
4. Confirm public GRI surfaces still fail closed if a verified fresh snapshot is unavailable.
5. Confirm Risk Gate copy continues to distinguish Private Pilot from generally available service.
6. Use a narrow founding-pilot offer around one real country, corridor or treasury workflow.
7. Keep Arc, x402 and prediction markets as technical proof rather than the primary company identity.
8. Preserve measured security/resilience evidence and its stated limitations in commercial materials.
