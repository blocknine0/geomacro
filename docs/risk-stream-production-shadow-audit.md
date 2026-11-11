# Event-driven Risk Stream — protected production shadow audit

## Current safety boundary

- PR #3902 merged core library; commercial production remains **disabled** by both `RISK_STREAM_ACTIVE=0` and `STREAM_INGESTION_ENABLED=false`.
- Deploy the separate `geomacro-risk-stream-shadow` Worker only. `STREAM_MODE=SHADOW_AUDIT`; **do not** set either production activation flag to true on this Worker.
- Shadow D1 (`geomacro-risk-stream-shadow`), private shadow R2 (`geomacro-risk-stream-shadow-private`), private shadow Queue (`geomacro-risk-stream-shadow`), and its DLQ are isolated from production. Never point them at production D1/R2.
- Shadow Worker has no customer routes, no paid API, no delivery-queue binding, no B2 binding, no Risk Index publication, no release-hold override. Shadow signed GROs remain `charged=false`, `customer_delivery_authorized=false`, and `certified_risk_index=false`.

## One-time provider provisioning (operator-approved)

1. Confirm live production `main` SHA and no active commercial stream. Provision a distinct shadow D1, private shadow R2, Queue and DLQ in the same intended Cloudflare account. Do **not** create shared bindings to production resources.
2. Copy `workers/risk-stream-shadow/wrangler.shadow.example.jsonc` to `workers/risk-stream-shadow/wrangler.shadow.jsonc`, insert the **shadow** D1 ID, and review all names and routes. Do not publish the example with placeholder D1 ID.
3. Apply `workers/control-plane/migrations/0214_risk_stream_event_driven.sql` **to shadow D1 only**, then `workers/risk-stream-shadow/sql/0001_shadow_audit.sql` **to shadow D1 only**. Check tables and indexes by readback. Take shadow D1 backup/Time Travel proof before running live inputs. Production migration 0214 is a separate release process and not required for this isolated Worker.
4. Configure the dedicated Worker secrets (never in GitHub or source): `STREAM_SHADOW_ADMIN_BEARER`, `RISK_STREAM_AES256_KEY_B64` (32-byte random AES key), `RISK_STREAM_MACHINE_FACTS_SPKI_B64`, `RISK_STREAM_MACHINE_RIGHTS_SPKI_B64`, `RISK_STREAM_GRO_SIGN_PKCS8_B64`, and `RISK_STREAM_GRO_VERIFY_SPKI_B64`. The machine-attester keys must represent two **independent** external verification services. Use a **distinct shadow GRO private signing key** and pinned matching public key.
5. Load only independently vetted `risk_stream_sources` into **shadow D1** with true publisher domains, media parents, roles, and valid rights/ownership statuses. Index-only entries can remain `commercial_rights_approved=0`; only real original-source events with independently verified commercial rights qualify for signing. Do not auto-invent source permissions or signatures. Category policy comes from migration 0214.
6. Deploy **only** the separate shadow Worker with Wrangler using its reviewed shadow config. Confirm authenticated `GET /v1/internal/shadow/receipts` works and unauthenticated access returns 401. Verify production `RISK_STREAM_ACTIVE=0` and `STREAM_INGESTION_ENABLED=false` remain unchanged.
7. Run the live shared B2 governor **read-only** parity check before test traffic: `GEOMACRO_STREAM_ADMIN_BEARER=... node scripts/ops/verify-risk-stream-b2-live-governor.mjs`. A drift or missing live D1 quota readback means **HOLD**. This validates production D1 shared-ledger code parity, **not** Backblaze provider-side counters. Verify actual provider allowance independently. Never silently raise the approved 4,080/day shared B2 total, PUT 2,000/day, GET 2,000/day, HEAD 40/day or native authorization 40/day. The dedicated shadow path uses private R2 and **zero B2 network calls**.
8. Obtain **20–50 genuinely observed** GDELT/RSS/official/website source events, normalized to `geomacro.risk-stream-candidate.v1` JSONL by the existing real source pipelines and, for any `VERIFIED_ORIGINAL`, signed by independent original-facts and commercial-rights attesters. GDELT index observations **must** be `kind=INDEX_ONLY`; they cannot produce a signed GRO. Keep data bounded and licensed, with no fabricated source or evidence.
9. Feed them to the dedicated Worker:
   `RISK_STREAM_SHADOW_URL=https://<shadow-subdomain>.workers.dev/v1/internal/shadow/events STREAM_SHADOW_ADMIN_BEARER=... node scripts/ops/push-risk-stream-shadow-jsonl.mjs < /private/path/real-shadow-candidates.jsonl`
   The 202 response means **durably queued, not processed or signed**.
10. After the Queue finishes, query the protected `GET /v1/internal/shadow/receipts` route or run a read-only query of `risk_stream_shadow_audit_receipts`. Check sum of new batch `event_count` is 20–50; note retries and duplicate IDs before calculating the distinct total. Confirm `d1_503_observed=0` on **every** batch and inspect `d1_write_p95_ms`, total batch latency and retries/DLQ. Observed 503, missing receipts, backlog, or R2 decryption/readback failure is a **HOLD**, even when retries recover.
11. Independently verify any signed GRO records using the pinned public Ed25519 SPKI from shadow configuration against the **D1-readback** canonical `payload_json`; compare `payload_sha256` and inspect `verified_signature_readbacks`. `corroborated_and_signed=0` means no signing proof was achieved; do **not** declare GRO acceptance based only on 20–50 index hints. An independent signed pair requires same event, different publisher domain and media parent, right roles, valid rights, exact original bytes, and both separate machine attestations.
12. Save immutable provider-backed receipts and perform an independent safety review. Do **not** deploy production 0214, remove canary hold, turn on customer delivery, or change payment/Predge policies based solely on this shadow test.

## Explicit shadow acceptance

- Verified actual cloud queue ingress of 20–50 new observations, batch size at most 10, 2s timeout, bounded retries and functioning DLQ.
- Provider D1 receipt: zero observed HTTP 503, no unhandled D1 failures, recorded write p95 and successful canonical readbacks. Do not confuse synthetic CI pass with live provider zero-503 proof.
- Private R2 PUT/GET/AES-GCM readback proof for every eligible original batch; no B2 account operations from shadow.
- For any qualifying independent original pair, Ed25519 GRO D1-readback signature must independently verify, and all commercial flags remain false. If no pair qualifies, keep signer acceptance **NOT PROVEN**.
- Live governor policy parity to reviewed `B2_DAILY_LIMITS`, provider allowance/headroom separately verified, no `HOT50_B2_LIVE_GOVERNOR_POLICY_DRIFT`.
- Zero production customer traffic, customer debits, independent reviewer certificates or canary hold changes from this run.

The shadow harness is a **preparation** for live provider-backed validation, not a claim that real source attesters, cloud resources or 20–50 live events have already run.

## Shadow DNS, attester and RSS recovery (12 November 2026)

**Governor DNS fallback.** The production B2 policy probe first looks up api.geomacro.live and falls back to the **pinned real control-plane Worker** at https://geomacro-control-plane.daspallab202391.workers.dev for a DNS/network/404/502/503/504 route failure. It never uses the isolated shadow D1 or an arbitrary caller-controlled hostname to assert live Worker parity. A 401/403, missing worker, stale UTC date or quota policy drift remains HOLD.

**Real independent attester provisioning.** Obtain two separately operated external attesters' public Ed25519 SPKI files (original-facts and commercial-rights) and secure JSONL samples of actual source-originals signed by both services. Do NOT generate substitute key pairs in GeoMacro. The script checks exact original hashes and both domain-separated signatures before any secret mutation. Run a non-mutating proof preflight first:

    node scripts/ops/provision-risk-stream-shadow-attester-keys.mjs /secure/facts.spki.b64 /secure/rights.spki.b64 /secure/real-originals.jsonl

When the operators' independent ownership and rights approvals are established, an authorized GitHub CLI session can install **only their public keys** into GitHub's protected production environment:

    node scripts/ops/provision-risk-stream-shadow-attester-keys.mjs /secure/facts.spki.b64 /secure/rights.spki.b64 /secure/real-originals.jsonl --apply

The protected workflow reads RISK_STREAM_MACHINE_FACTS_SPKI_B64 and RISK_STREAM_MACHINE_RIGHTS_SPKI_B64 and installs the same public keys as bindings on the dedicated shadow Worker during provisioning. If that Worker is already deployed, append the following after --apply to provision directly using an existing, operator-reviewed generated shadow configuration:

    --worker-config workers/risk-stream-shadow/wrangler.shadow.runtime.jsonc

The script refuses a non-isolated Worker configuration or customer routes. It does not upload private attester keys, raw originals, the shared commerce root, payment secrets, or key-generating fixtures. Two different public fingerprints do not by themselves prove independent organizational ownership; confirm that separately.

**Reuters/AP feed availability.** Direct Reuters and AP public RSS endpoints may return 404/403; the fallback also tries Google News RSS searches restricted to their publisher domains. Those Google News links remain third-party INDEX_ONLY pointers: Google indexing is not verification of Reuters/AP original text, independent publisher attribution, or commercial reuse rights. BBC RSS is fetched directly. Do not dereference and republish source article bodies.

**GDELT 429.** The discovery feeder paces GDELT at no more than one call/second, immediately tries Reuters/AP/BBC public RSS indexes after a 429, and uses at most three exponentially delayed retries. It honors a bounded Retry-After interval, deferring longer waits to another audit. A feed failure or fewer than 20 actual recent URL observations is HOLD, not generated sample data. RSS/GDELT articles are INDEX_ONLY and cannot produce signed GROs.

**Terminal acceptance.** The protected workflow retains a structured redacted scorecard and checks: live production Worker governor parity; 20–30 actual index events acknowledged by shadow D1 receipts; zero observed 503 for completed microbatches; real independently supplied attester public keys; and at least ten signed GROs with ten Ed25519 verifications against D1-readback JSON. The current index-only feeder **cannot** satisfy that final signing gate, regardless of how many links it discovers. Separate real original-source pairs with independently validated rights and both machine attestations are required. Until provided and processed, the correct terminal result is HOLD_INCOMPLETE_SHADOW_PROOF. Zero B2 shadow operations, no commercial activation, and existing canary hold are invariant.

Operator dispatch: In GitHub Actions, choose Risk Stream Isolated Shadow Provider Audit and set approval to RUN_ISOLATED_SHADOW_INDEX_ONLY_NO_FUNDS. The workflow also triggers when its reviewed shadow recovery code changes on main.

## Isolated zero-traffic B2 governor candidate

The protected shadow audit deploys only \`geomacro-risk-stream-governor-candidate\`
with a read-only D1 binding to \`geomacro-risk-stream-shadow\`. It imports
the exact \`workers/control-plane/src/b2-account-quota.mjs\` module; there is
no quota override. Its sole authenticated endpoint returns the isolated D1
policy and ledger, with verified 401 for unauthenticated access. The candidate
does not have production routes, B2 credentials, queues, timers or commerce.
The scorecard separates **isolated deployed policy parity** from **live
production shared D1 governor parity**. A candidate PASS never removes
\`config/d1-hotspot-v2-canary.hold\` or authorizes 1→100% production traffic.
