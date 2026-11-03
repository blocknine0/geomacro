# Predge signed research context: 3-hour validity approval (3 November 2026)

Amir confirmed by email on 2026-11-03 that Predge's validator accepts a signed research/news-context envelope with `expires_at = generated_at + 3 hours`. The validator requires `expires_at > generated_at` and rejects the envelope at or after expiry, not because the gap exceeds one hour. The pilot-check/news-context validator uses the same rule.

This supersedes one-hour envelope-TTL statements in `SIGNED_NEWS_CONTEXT_V2_BRANCH_ACCEPTANCE.md`. GeoMacro's implementation adds a three-hour maximum signed pilot envelope lifetime while keeping fresh original source collection, 72-hour news retention, research-only flags, active pinned Ed25519 signature verification, and non-billable behavior unchanged. The existing protected refresh cadence remains 30 minutes and is still subject to opt-in. No paid per-request signed GRO or customer billing change is authorized by this approval.

## Production acceptance evidence still required

1. CI must pass at the exact PR head.
2. Merge, deploy the GeoMacro control plane through the existing protected production path, and produce a **real** research-backed envelope with `expires_at - generated_at = 10,800,000ms`.
3. Independently verify hash, pinned Ed25519 signature, active-key registry, production D1 PUT/GET exact readback, acceptance before expiry and refusal at/after expiry.
4. Confirm the recurring signing job is actually enabled and automatic successful refreshes occur, rather than relying on a passing no-op or manual workflow.
5. Do not represent the 3h research envelope as an eligible paid GRO, risk score, or commercial delivery.
