# Testnet browser recovery validation

Scope: wallet-only registration and browser pay-per-call recovery. No production database changes, mainnet transactions or publishing are included.

## Changes

- Preserve the exact request, quote and submitted transaction proof before receipt polling or API delivery. Recovery is scoped to the current entitlement in browser session storage, without API secrets or session tokens.
- Retry a saved payment without invoking another wallet transfer. Preserve it across reloads in the same tab; clear recovery after successful delivery.
- Lock concurrent quote/payment actions and form edits while payment is unresolved.
- Re-check the selected chain before submitting the USDC transfer.
- Reject invalid JSON/HTML API responses instead of reporting false success. Bound console HTTP requests to 30 seconds.
- Display nested registration errors, block concurrent registration submissions, and allow wallet verification to be retried after partial entitlement provisioning.

## Local evidence

Base: canonical `3972ba1467cbf29dfb8cb2723e8f4b3d0f1f6a4c`.

- Complete application suite: 110 files, 768 tests passed.
- Testnet-specific suite: 24 files, 120 tests passed.
- New browser-script execution regressions: receipt RPC failure, API timeout, HTML fallback, same-tab reload, wrong chain, concurrent clicks, registration error rendering and partially provisioned access.
- Production build passed (existing deprecation/chunk warnings remain).
- Migration safety: 69 migrations passed; no migrations changed.
- Existing synthetic in-memory stress model: 10,000 users, 200,000 accepted modeled requests, 10,000 exact transaction replays, zero modeled double-credit events. This is NOT a real backend load test or production capacity result.

## Launch gates still required

- CI on this branch and review before merging; merging canonical main invokes the existing Lovable mirror workflow.
- Verify the published access-page deployment and no-store cache contract; live inspection before this patch observed a different cache policy. Source synchronization alone does not establish live deployment.
- Perform the real profile -> wallet signature -> entitlement -> API credentials -> HTTP 402 -> Testnet USDC payment -> proof retry flow. No real wallet signature or payment was executed for these local tests.
- Exercise API-level conflicting payload/request IDs, wrong-wallet/token/recipient, stale proofs and concurrent backend retries against the database, rather than treating browser recovery or the in-memory stress model as settlement acceptance.
- Verify all eight capabilities with compatible live data, signed Risk Objects and Risk Gate's `execution_authorized=false` boundary.

Session storage is not a cross-device payment ledger. Closing a tab, losing storage, or a wallet submission failing before returning a transaction hash requires wallet/ledger reconciliation. Do not automatically send a replacement transfer. Browser state is untrusted; the server remains responsible for authenticating and verifying every proof.
