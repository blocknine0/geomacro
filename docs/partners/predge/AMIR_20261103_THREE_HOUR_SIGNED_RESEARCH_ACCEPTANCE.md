# Predge signed research context: 3-hour validity approval (3 November 2026)

Amir confirmed by email on 2026-11-03 that Predge's validator accepts a signed research/news-context envelope with `expires_at = generated_at + 3 hours`. The validator requires `expires_at > generated_at` and rejects the envelope at or after expiry, not because the gap exceeds one hour. The pilot-check/news-context validator uses the same rule.

This supersedes one-hour envelope-TTL statements in `SIGNED_NEWS_CONTEXT_V2_BRANCH_ACCEPTANCE.md`. GeoMacro's implementation adds a three-hour maximum signed pilot envelope lifetime while keeping fresh original source collection, 72-hour news retention, research-only flags, active pinned Ed25519 signature verification, and non-billable behavior unchanged. The existing protected refresh cadence remains 30 minutes and is still subject to opt-in. No paid per-request signed GRO or customer billing change is authorized by this approval.

## Production acceptance evidence still required

1. CI must pass at the exact PR head.
2. Merge, deploy the GeoMacro control plane through the existing protected production path, and produce a **real** research-backed envelope with `expires_at - generated_at = 10,800,000ms`.
3. Independently verify hash, pinned Ed25519 signature, active-key registry, production D1 PUT/GET exact readback, acceptance before expiry and refusal at/after expiry.
4. Confirm the recurring signing job is actually enabled and automatic successful refreshes occur, rather than relying on a passing no-op or manual workflow.
5. Do not represent the 3h research envelope as an eligible paid GRO, risk score, or commercial delivery.

## Partner-reported acceptance and independently checked production receipts (3 November 2026)

- **Partner report (Amir, email 2026-11-03):** The live `/v1/pilot/check` sample passed Predge's payload-hash and pinned Ed25519 verification, research-only flags, item-count and wire-size tests. Their observed sample contained **142 items** and was approximately **220 KB**. This is a report by Predge, not a reproduced partner-side validator log.
- **GeoMacro deployment proof:** GitHub Actions [41628942029](https://github.com/blocknine0/geomacro/actions/runs/41628942029) deployed production control-plane at source SHA `4af304f22d92b43c1bf3241c5283a56e06f9c9ce`; Wrangler Worker publish and authenticated Predge D1 checks succeeded.
- **Automatic post-deploy signed publication:** Protected GitHub Actions [41629495377](https://github.com/blocknine0/geomacro/actions/runs/41629495377) ran on `workflow_run`, opted in, admitted `SIGNING_DUE`, signed, published, and independently owner-read-back a real envelope with `generated_at=2026-11-03T11:41:15.054Z` and `expires_at=2026-11-03T14:41:15.054Z` (exactly three hours). `readback_verified=true`, with no partner check quota consumption. Its delivered category counts were `50/50/41` (total **141**), a later snapshot than the one Predge reported.
- **Scope of acceptance:** Signed **research-only pilot**, never an eligible commercial signed GRO, risk score, customer authorization, or billable paid Risk Gate delivery. `affects_risk_gate=false` remains mandatory. No payment, pricing or rights policy was changed.
- **Remaining operational obligation:** Continue monitoring automatic cadence and expiry failures. One successful post-deploy automatic signing run confirms activation, not an uninterrupted availability SLA. The standalone `schedule` wake has not been independently confirmed in this acceptance record; the trusted `workflow_run` wake has been confirmed.
