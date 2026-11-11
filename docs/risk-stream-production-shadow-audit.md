# Event-driven Risk Stream — protected production shadow audit

## Current safety boundary

- PR #3902 merged core library; commercial production remains **disabled** by both \`RISK_STREAM_ACTIVE=0\` and \`STREAM_INGESTION_ENABLED=false\`.
- Deploy the separate \`geomacro-risk-stream-shadow\` Worker only. \`STREAM_MODE=SHADOW_AUDIT\`; **do not** set either production activation flag to true on this Worker.
- Shadow D1 (\`geomacro-risk-stream-shadow\`), private shadow R2 (\`geomacro-risk-stream-shadow-private\`), private shadow Queue (\`geomacro-risk-stream-shadow\`), and its DLQ are isolated from production. Never point them at production D1/R2.
- Shadow Worker has no customer routes, no paid API, no delivery-queue binding, no B2 binding, no Risk Index publication, no release-hold override. Shadow signed GROs remain \`charged=false\`, \`customer_delivery_authorized=false\`, and \`certified_risk_index=false\`.

## One-time provider provisioning (operator-approved)

1. Confirm live production \`main\` SHA and no active commercial stream. Provision a distinct shadow D1, private shadow R2, Queue and DLQ in the same intended Cloudflare account. Do **not** create shared bindings to production resources.
2. Copy \`workers/risk-stream-shadow/wrangler.shadow.example.jsonc\` to \`workers/risk-stream-shadow/wrangler.shadow.jsonc\`, insert the **shadow** D1 ID, and review all names and routes. Do not publish the example with placeholder D1 ID.
3. Apply \`workers/control-plane/migrations/0214_risk_stream_event_driven.sql\` **to shadow D1 only**, then \`workers/risk-stream-shadow/sql/0001_shadow_audit.sql\` **to shadow D1 only**. Check tables and indexes by readback. Take shadow D1 backup/Time Travel proof before running live inputs. Production migration 0214 is a separate release process and not required for this isolated Worker.
4. Configure the dedicated Worker secrets (never in GitHub or source): \`STREAM_SHADOW_ADMIN_BEARER\`, \`RISK_STREAM_AES256_KEY_B64\` (32-byte random AES key), \`RISK_STREAM_MACHINE_FACTS_SPKI_B64\`, \`RISK_STREAM_MACHINE_RIGHTS_SPKI_B64\`, \`RISK_STREAM_GRO_SIGN_PKCS8_B64\`, and \`RISK_STREAM_GRO_VERIFY_SPKI_B64\`. The machine-attester keys must represent two **independent** external verification services. Use a **distinct shadow GRO private signing key** and pinned matching public key.
5. Load only independently vetted \`risk_stream_sources\` into **shadow D1** with true publisher domains, media parents, roles, and valid rights/ownership statuses. Index-only entries can remain \`commercial_rights_approved=0\`; only real original-source events with independently verified commercial rights qualify for signing. Do not auto-invent source permissions or signatures. Category policy comes from migration 0214.
6. Deploy **only** the separate shadow Worker with Wrangler using its reviewed shadow config. Confirm authenticated \`GET /v1/internal/shadow/receipts\` works and unauthenticated access returns 401. Verify production \`RISK_STREAM_ACTIVE=0\` and \`STREAM_INGESTION_ENABLED=false\` remain unchanged.
7. Run the live shared B2 governor **read-only** parity check before test traffic: \`GEOMACRO_STREAM_ADMIN_BEARER=... node scripts/ops/verify-risk-stream-b2-live-governor.mjs\`. A drift or missing live D1 quota readback means **HOLD**. This validates production D1 shared-ledger code parity, **not** Backblaze provider-side counters. Verify actual provider allowance independently. Never silently raise the approved 4,080/day shared B2 total, PUT 2,000/day, GET 2,000/day, HEAD 40/day or native authorization 40/day. The dedicated shadow path uses private R2 and **zero B2 network calls**.
8. Obtain **20–50 genuinely observed** GDELT/RSS/official/website source events, normalized to \`geomacro.risk-stream-candidate.v1\` JSONL by the existing real source pipelines and, for any \`VERIFIED_ORIGINAL\`, signed by independent original-facts and commercial-rights attesters. GDELT index observations **must** be \`kind=INDEX_ONLY\`; they cannot produce a signed GRO. Keep data bounded and licensed, with no fabricated source or evidence.
9. Feed them to the dedicated Worker:
   \`RISK_STREAM_SHADOW_URL=https://<shadow-subdomain>.workers.dev/v1/internal/shadow/events STREAM_SHADOW_ADMIN_BEARER=... node scripts/ops/push-risk-stream-shadow-jsonl.mjs < /private/path/real-shadow-candidates.jsonl\`
   The 202 response means **durably queued, not processed or signed**.
10. After the Queue finishes, query the protected \`GET /v1/internal/shadow/receipts\` route or run a read-only query of \`risk_stream_shadow_audit_receipts\`. Check sum of new batch \`event_count\` is 20–50; note retries and duplicate IDs before calculating the distinct total. Confirm \`d1_503_observed=0\` on **every** batch and inspect \`d1_write_p95_ms\`, total batch latency and retries/DLQ. Observed 503, missing receipts, backlog, or R2 decryption/readback failure is a **HOLD**, even when retries recover.
11. Independently verify any signed GRO records using the pinned public Ed25519 SPKI from shadow configuration against the **D1-readback** canonical \`payload_json\`; compare \`payload_sha256\` and inspect \`verified_signature_readbacks\`. \`corroborated_and_signed=0\` means no signing proof was achieved; do **not** declare GRO acceptance based only on 20–50 index hints. An independent signed pair requires same event, different publisher domain and media parent, right roles, valid rights, exact original bytes, and both separate machine attestations.
12. Save immutable provider-backed receipts and perform an independent safety review. Do **not** deploy production 0214, remove canary hold, turn on customer delivery, or change payment/Predge policies based solely on this shadow test.

## Explicit shadow acceptance

- Verified actual cloud queue ingress of 20–50 new observations, batch size at most 10, 2s timeout, bounded retries and functioning DLQ.
- Provider D1 receipt: zero observed HTTP 503, no unhandled D1 failures, recorded write p95 and successful canonical readbacks. Do not confuse synthetic CI pass with live provider zero-503 proof.
- Private R2 PUT/GET/AES-GCM readback proof for every eligible original batch; no B2 account operations from shadow.
- For any qualifying independent original pair, Ed25519 GRO D1-readback signature must independently verify, and all commercial flags remain false. If no pair qualifies, keep signer acceptance **NOT PROVEN**.
- Live governor policy parity to reviewed \`B2_DAILY_LIMITS\`, provider allowance/headroom separately verified, no \`HOT50_B2_LIVE_GOVERNOR_POLICY_DRIFT\`.
- Zero production customer traffic, customer debits, independent reviewer certificates or canary hold changes from this run.

The shadow harness is a **preparation** for live provider-backed validation, not a claim that real source attesters, cloud resources or 20–50 live events have already run.
