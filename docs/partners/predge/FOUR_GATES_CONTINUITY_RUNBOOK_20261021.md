# Predge continuity + four remaining commercial acceptance gates (21 Oct 2026)

**Truthful scope:** Predge's rotated Bearer research feed was independently confirmed by Amir and by the Geomacro production D1 deployment. Research stays operational separately from paid GRO or Risk Gate. Nothing in this document grants commercial source rights, enables payments or guarantees 100% uptime on free quotas.

## Operational research SLO and low-quota discipline

- Authenticated endpoint: `GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h`.
- No real-money/paid billing; 72h derived-only D1 journal, 15-minute publishing delay. A 0-record category is honest coverage, not automatically an outage.
- Current pilot hard stop: **2027-01-17T00:00:00Z**. Schedule an owner-approved renewal/change before this date; a new subscription does not silently extend the code-level permission.
- D1 atomic research cap: **500 requests per UTC day**, recommended **100/day**. Predge can poll once every 15 minutes (96/day), reserve headroom for retries, and perform backoff on HTTP 429, respect Retry-After and same-item ID deduplication. 96/day is a suggested client cadence, not a promised refresh SLA.
- Scheduled GitHub Actions `predge-research-continuity.yml`: 4 protected authenticated GETs per day and same-D1 journal parity, plus free public read and separate public Risk Gate readiness (no paid requests). This spends only 4 of the 500 daily research calls. CI/scheduled GitHub jobs can be delayed; enable repository Actions failure notifications. Never write token or raw articles in logs.
- Use per-item original published clocks: do not relabel 72h retained observations as newly observed facts; fail closed on missing source rights. 0 macro/rare_earth records means more genuinely qualified source retrieval is needed, never manufacture them.
- Credential incident: rotate owner-protected research token if it leaks; redeploy, confirm old=401/new=200 and inform Predge through verified encrypted handoff. Keep distinct admin, research and Risk Gate secrets.

## Gate 1: genuine current production GRO (BLOCKED until actual qualified input)

Reuse existing `GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1`
profile and its *three separate* trust roles:

1. Independently fetch **current real** first-party original pages, 2–4 separately originated same-event issuer pages for the existing automated commercial qualification profile. Archive actual bytes, SHA256, original publication clocks and rights evidence privately. Do not treat duplicate/syndicated coverage as two originals; if no current event qualifies, make no GRO and keep advisory PAUSE.
2. Existing distinct facts and rights authorities genuinely review real same-event evidence/retractions and exact article-scoped derived commercial rights (without passing source-licensed or raw records to a buyer); each signs its own canonical machine-commercial proof. **No mock permission or self-signed test key.** Protected guidance: `docs/ops/ZERO_COST_OFFLINE_MACHINE_ISSUER.md`.
3. Third distinct pinned production Ed25519 GRO custodian signs the exact GRO-1.1 canonical bytes; `scripts/ops/accept-private-geomacro-machine-commercial-gro.ts` accepts a private, protected 0600 input and prepares a locally verified signed output (no funds).
4. Use `scripts/ops/publish-private-signed-gro-d1.ts` with explicitly protected `GEOMACRO_DIRECT_GRO_PUBLISH_ACK=YES` plus **existing** scoped B2 and D1 credentials. It verifies active pin/signature, actual permission/evidence, clock (maximum roughly 3h GRO TTL), then B2 PUT + exact GET/gzip hash readback and only afterward D1 hot/index promotion. It never fabricates signatures.
5. Owner checks real `country_gro_verified_hot` / `risk_object_index` SHA/age/pin/source-rights readback and paid Risk Gate readiness. Future renewal jobs may publish **only newly requalified genuine evidence**, not rescore the same stale original every 3h.

Do not send or log signing private keys, raw originals, or permission documents in GitHub/ChatGPT/email. Existing legacy Supabase GRO records (21,178 total; current unexpired 0 at last checked) are historical only.

## Gate 2: dedicated paid Risk Gate authentication (owner action needed)

- On the owner's trusted Windows machine, use Node `crypto.randomBytes(32).toString("hex")` to generate a **new** 64-lowercase-hex bearer different from research/admin/root.
- Add it as GitHub `Settings -> Environments -> production -> Environment secrets` with exact name `PREDGE_RISK_GATE_TOKEN`. Do not post the value or put it in a GitHub workflow input.
- Rerun `Deploy D1 Control Plane` from `main` to provision a separate Cloudflare Worker secret. Test wrong/research/admin bearer rejection (401), endpoint readiness and no-funds replay/expiry/quota/idempotency. Current 100/day D1 Risk Gate quota remains bounded.
- A secret being configured **is not** a paid launch approval. Keep the credential private from Predge until ready commercial right/contract is established; do not reuse their research Bearer.

## Gate 3: live paid Risk Gate partner acceptance (genuine GRO first)

- Read-only `GET /v1/public/risk-gate-d1-readiness` has separate checks: D1, partner isolated secret, active pinned public key and **current genuine signed commercial country GRO**. Its HTTP 200 readiness is necessary but does not itself approve charging, rights or partner market-context verification. 503 is a correct not-ready response.
- Confirm external `POST https://geomacro.live/api/risk-gate` points to exact deployed D1 Worker; do not assume Lovable website SHA matches automatically. Use `docs/partners/predge/risk-gate-request.json` and `risk-gate-corridor-request.json`; `risk-gate-1.0` is advisory **response** schema.
- Validate independent Predge-signed market context using `scripts/ops/verify-predge-signed-market.mjs`: pinned active Ed25519, canonical payload + context SHA256 + envelope + exact HTTP body detached signature, market/UMA identity. Real example `5710779` was accepted no-funds in PR #2581. Do NOT assume Geomacro GRO hash equals `context_sha256`.
- In a protected test with the **dedicated** Risk Gate bearer, assert valid country/corridor relevant GRO returns correct deterministic advisory `execution_authorized:false`, unknown/retired/expired input returns PAUSE, replay is idempotent, conflicting request_id returns 409, wrong token returns 401, quota stays bounded and payment remains 0. Same origin=destination corridor is rejected.
- PR #2599 ensures *missing current GRO* does not burn quota or permanently claim request IDs. A stale/invalid paid input must never downgrade into fabricated CONTINUE. At least one genuine signed corridor GRO is necessary before declaring corridor scoring operational; a country GRO alone is not corridor acceptance.
- Only after full commercial/rights terms + actual partner live acceptance + explicit founder real-money authorization should any paid entitlement or billing/settlement be considered. Risk Gate advisory cannot authorize execution/trades.

## Gate 4: monthly commercial agreement (requires Predge's 30 October scope)

Amir committed to supply by **Friday 30 October 2026**: category selection, expected monthly calls/records, refresh requirements and history duration. Discuss an optional fixed monthly subscription or hybrid pay-per-capability; any paid Risk Gate revenue share is separately negotiated. **No price or share was agreed**. Target commercial-framework discussion: **18 November 2026**.

Commercial document must specify included calls/records/retention & 72h hot vs historical, target countries/corridors, freshness, burst rate, quota/overage behavior, licensing/redistribution of derived-only output, what a billable accepted verified response is vs 503/PAUSE/retry, ownership/signature/key rotation, disputes/refunds, revenue-share basis (gross/net, taxes, chargebacks, renewal/termination), no execution authorization, monitoring/support, and what happens when no eligible current GRO exists. Never charge a failed verification or the research-only feed.

**Do not turn on chargeable service merely because a subscription price is agreed.** First run bounded no-funds exact settlement and hash/canonical proof acceptance, then obtain express real-money consent separately.

## Owner checklist (no private values)

- [x] Predge research HTTP 200 independently confirmed; signed test GRO agreed; Predge market 5710779 independently verified
- [x] Signed-data no-GRO request ID non-poisoning change merged in PR #2599; production deploy acceptance run #39594443913 passed
- [x] Low-quota pilot continuity workflow/test merged in PR #2600; **first scheduled/manual protected heartbeat receipt remains to be verified**
- [ ] One genuine current signed/rights-eligible country GRO published + exact B2/D1 readback
- [ ] Separate paid Risk Gate secret created privately and deployed
- [ ] Relevant country AND corridor acceptance with real GROs and current live website SHA
- [ ] Predge volume/refresh/history requirements received, terms negotiated and signed (Oct30/Nov18)
- [ ] Explicit real-money launch approval after all verifications; no bypass

**Continuity distinction:** research can continue unscored under its independent quota/pilot permission even when paid GRO/Risk Gate is PAUSE. You cannot guarantee continuous *scored paid* output when real current evidence, rights or signer inputs do not exist. Do not retire remaining old Supabase storage/payment records without separate verified migration.
