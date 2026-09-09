# Security & Resilience Launch Evidence

This is a concise evidence summary for Early Access materials. It records what was actually tested and preserves the limitations of the scoped pre-demo audit.

## Scope

Release-candidate staging covered the agentic Risk Gate technical-demo path, including generated-route reproducibility, server-function CSRF protection, x402 unpaid/paid delivery, signed Risk Object verification, fail-closed execution boundaries, and isolated HTTP resilience testing.

## Measured results

- Product tests/build: passed on the release candidate.
- Database migration safety: full zero-to-current replay passed on disposable Supabase after merge.
- Local unpaid x402 contract: passed.
- External HTTPS unpaid x402 contract: passed.
- One Arc Testnet paid x402 regression: passed at `0.001 USDC`.
- Paid Risk Gate response: `REQUIRE_APPROVAL`, `execution_authorized=false`.
- Resilience `/api/demo/preflight`: 40 requests at concurrency 8; 20 HTTP 200, 20 HTTP 429; 0 server errors, timeouts, network errors or boundary violations; p95 3703.23 ms.
- Resilience `/api/agent/risk`: 40 requests at concurrency 8; 30 HTTP 402, 10 HTTP 429; 0 server errors, timeouts, network errors, missing payment-required headers or boundary violations; p95 1285.30 ms.

Rate-limit responses were expected behavior from the scoped abuse controls.

## Remediation verified

- stale generated route tree fixed and protected by a permanent post-build CI drift check;
- prior Buffer SSR failure absent in the tested runtime;
- TanStack server functions protected with CSRF middleware;
- stale or unavailable canonical GRI context does not become a synthetic fallback score;
- public-facing internal/payment failures are sanitized;
- request inputs are bounded and public demo endpoints are throttled;
- the staging resilience harness blocks production hosts and performs no payment.

## Limitations

This is not a third-party security audit or certification. The public demo limiter is process-local rather than a distributed production edge limiter. The test was scoped to isolated technical staging, not a production load test or SLA benchmark. Corridor risk remains a directional endpoint-composed pilot. Structural evidence may be unavailable in isolated staging. No claim of autonomous execution, custody, complete sanctions coverage or production-grade institutional availability follows from these results.
