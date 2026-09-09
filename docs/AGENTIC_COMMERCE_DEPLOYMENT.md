# Agentic Commerce Deployment Runbook

Status: **TECHNICAL PROOF. PUBLIC DEPLOYMENT PENDING FINAL LAUNCH GATES.**

This runbook covers the Geomacro Risk Gate + Circle x402 Arc Testnet technical demo. It is separate from institutional pricing, production SLAs, autonomous execution, and GRI methodology.

## 1. Product and safety boundary

The x402 rail is an access/payment mechanism around a Geomacro risk resource.

It does **not**:

- change GRI methodology;
- bypass source-rights or proof controls;
- authorize or submit a financial transaction;
- make Geomacro a wallet custodian or signer;
- turn Risk Gate into an autonomous execution engine.

Every delivered Risk Gate response must preserve:

```text
execution_authorized=false
```

The customer or external agent owns any later execution decision.

## 2. Current source branch

Until PR #115 is merged, staging must use:

```text
feat/agentic-commerce-demo-current-main
```

Always pin evidence to an exact commit:

```bash
git fetch origin
git checkout --detach origin/feat/agentic-commerce-demo-current-main
git rev-parse HEAD
bun install --frozen-lockfile
```

Do not test a stale Lovable preview or an older deployment branch and call that evidence for the current head.

## 3. Database topology

### Production

Production application Supabase is separate and its migration history is aligned through:

```text
035_agentic_demo_feedback.sql
```

Never use any of the following against production merely to make migration output look clean:

```text
db reset --linked
migration repair
--include-seed
```

### Isolated staging actually used for this demo

The verified staging setup is a **dedicated second Supabase Free project**, not a Supabase Branching preview:

```text
name: geomacro-staging
project ref: hencqxkmmcgnothotqpq
```

Supabase persistent Branching was not used because that plan path required an upgrade. Do not retry it as a prerequisite for the demo.

The staging project was created without copying production data. Migrations `000` through `035` were applied and the core schema contract was verified against the staging project ref.

If a future paid plan makes Supabase Branching available, a data-less persistent branch is also acceptable. It is not required.

## 4. Staging credentials and signing

Use staging-only application credentials and a **staging-only Ed25519 Risk Object signing key**.

Never reuse the production Risk Object signing private key in staging.

Never expose server-only values with a `VITE_` prefix, and never commit or paste:

- Supabase service-role keys;
- signing private keys;
- wallet private keys or seed phrases;
- Circle session tokens;
- OTPs or other access tokens.

The dedicated staging x402 seller/pay-to role must remain separate from unrelated treasury, market, fee, or contract addresses.

## 5. Populate signed staging Risk Objects

Do not fabricate a zero-risk SQL fixture merely to make the demo work.

Use the existing publication/preflight path so staging exercises the real signing and fail-closed boundary. For example:

```bash
bunx tsx scripts/test-corridor-risk-gate-preflight.ts USA CHN
```

A valid staging proof must show, at minimum:

```text
signature_present=true
signature_valid=true
execution_authorized=false
executor_called=false
```

The previously verified `USA>CHN` staging object correctly returned `REQUIRE_APPROVAL`, `verification_status=INCOMPLETE`, and `commercial_eligibility_status=UNVERIFIED` because fresh isolated staging did not contain commercial evidence. That disclosure is correct; do not hide it.

## 6. Structural and GRI context in staging

Historical structural credentials are **optional for the technical staging proof**.

If the historical warehouse is not configured, the API must return an explicit state such as:

```text
status=NOT_CONFIGURED
methodology_status=EVIDENCE_ONLY_NOT_IN_GRI_V1_2
```

Missing structural context must never be converted to zero risk.

For a commercial pilot or production deployment, configure the governed historical serving layer and preserve its evidence-only boundary.

GRI context is also optional in isolated staging. The agentic service now reuses the exact canonical public GRI read contract. Therefore only a current-method, proof-verified, fresh public-eligible GRI can be returned. Otherwise:

```text
gri_context=null
```

Do not introduce a stale or synthetic GRI fallback for the demo.

## 7. Circle Arc Testnet roles

Use Circle **testnet** Agent Wallets only.

Keep separate buyer and seller roles:

```bash
export GEOMACRO_X402_AGENT_WALLET_ADDRESS="0xBUYER_ADDRESS"
export CIRCLE_X402_SELLER_ADDRESS="0xDEDICATED_SELLER_ADDRESS"
```

The payment contract is pinned to:

```text
network: eip155:5042002
asset: 0x3600000000000000000000000000000000000000
price: 1000 atomic = 0.001 USDC
Gateway verifying contract: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9
facilitator: https://gateway-api-testnet.circle.com
```

Gateway uses an EIP-3009 authorization with a unique nonce per payment. Do not attempt to implement manual authorization reuse as an application retry mechanism.

## 8. Unpaid x402 contract verification

Always run the unpaid stage before authorizing a payment:

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
bun run agentic:x402:e2e
```

A pass requires:

- HTTP `402`;
- `PAYMENT-REQUIRED` header;
- x402 version `2`;
- Arc Testnet network and USDC address above;
- amount `1000`;
- dedicated seller/payTo;
- `maxTimeoutSeconds >= 604900`;
- Gateway verifying contract above;
- response boundary `execution_authorized=false`.

With no `GEOMACRO_X402_E2E_ACK`, the harness performs **no payment**.

## 9. Paid Arc Testnet E2E

Only after the unpaid contract passes:

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
GEOMACRO_X402_AGENT_WALLET_ADDRESS="$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
GEOMACRO_X402_E2E_ACK=ARC_TESTNET_USDC \
bun run agentic:x402:e2e
```

The acknowledgement authorizes one Arc Testnet call capped at `0.001 USDC`.

A successful response must identify:

```text
provider=circle_gateway_x402
execution_authorized=false
```

Do not claim one onchain transaction per API call. Circle Gateway may return a settlement reference while batching onchain settlement.

### Recorded payment evidence

A real Arc Testnet E2E previously passed on the pre-security-hardening head `fd70ea37d4b68a9ff60716758d130e4aa69a3ce1`:

```text
buyer Gateway balance before: 0.500000 USDC
buyer Gateway balance after:  0.499000 USDC
amount:                       0.001 USDC
settlement reference:         77469123-eeca-41ea-8412-58b45f9ff3b3
Risk Gate decision:           REQUIRE_APPROVAL
execution_authorized:         false
```

This proves the payment architecture. It is **not** exact-head evidence for later security commits. Before public launch, rerun unpaid and paid regression checks on the final release candidate.

## 10. CSRF and public API hardening

The custom TanStack Start entrypoint must include `createCsrfMiddleware` filtered to `serverFn` handlers.

The public file routes remain separately hardened with:

- bounded request bodies;
- schema validation;
- no-store responses;
- stable fail-closed error codes;
- sanitized generic internal failures;
- bounded in-process per-client and global abuse throttles;
- an explicit global throttle on unpaid x402 resource preparation.

The in-process limiter is a technical-demo protection layer, **not** a claim of distributed production-grade rate limiting. A later production deployment should use an edge/distributed limiter appropriate to the hosting platform.

## 11. Staging resilience test

Use the dedicated no-payment agentic resilience harness:

```bash
GEOMACRO_AGENTIC_STAGING_BASE_URL=https://<staging-host> \
GEOMACRO_AGENTIC_STAGING_EXPECTED_HOST=<staging-host> \
GEOMACRO_AGENTIC_RESILIENCE_ACK=STAGING_ONLY \
bun run agentic:resilience
```

Defaults exercise both:

```text
POST /api/demo/preflight
POST /api/agent/risk
```

The x402 resilience phase is unpaid and expects `402` or intentional `429` throttling. The free preflight phase expects `200` or intentional `429` throttling.

The harness hard-blocks:

```text
geomacro.live
www.geomacro.live
```

A pass requires:

- at least one primary successful response per endpoint;
- no `5xx` responses;
- no timeout or network errors;
- parseable JSON;
- no unexpected status codes;
- no execution-boundary violation;
- `PAYMENT-REQUIRED` present on x402 `402` responses.

It writes a JSON evidence artifact with request counts, status distribution, throughput, p50/p95/p99/max latency, failures, and limitations.

Staging results are not a production SLA.

## 12. Security review scope

Before public demo launch, preserve evidence for at least:

1. exact-head Product CI;
2. Risk Object Key Lifecycle CI;
3. Database Schema Safety / zero-to-current migration replay;
4. serverFn CSRF protection;
5. signed Risk Object verification and subject/context matching;
6. `execution_authorized=false` before and after payment settlement;
7. request/body validation and abuse throttling;
8. public error sanitization;
9. privacy-minimized feedback persistence and RLS;
10. canonical proof-verified GRI context or explicit `null`;
11. staging resilience results;
12. final-head unpaid x402 regression;
13. final-head paid `0.001 USDC` Arc Testnet regression.

Fix and re-test any critical/high finding. Do not describe the review as an independent third-party audit or certification unless one is actually obtained.

## 13. Known technical-proof limitations

Disclose these rather than hiding them:

- only USA, CHN, `USA>CHN`, and `CHN>USA` are enabled in the demo allowlist;
- corridor intelligence is directional endpoint composition, not route/logistics/counterparty modelling;
- structural historical context may be `NOT_CONFIGURED` in isolated technical staging;
- GRI may be `null` if the canonical public GRI contract is not available in that staging runtime;
- public demo throttling is process-local plus a process-global bucket, not distributed edge rate limiting;
- `client_request_id` is a correlation value for this technical demo, not a promise of application-level refund/business idempotency;
- x402 is Arc Testnet technical proof and `0.001 USDC` is not institutional pricing;
- no production SLA, certification, or autonomous execution claim.

## 14. Public-launch decision

Only after the final-head runtime, resilience, and security gates pass should Geomacro consider:

- adding `/demo` to the public sitemap;
- changing technical-proof wording to a public-live claim;
- updating Circle / Julie with the concrete milestone;
- re-engaging Dan with the Risk Gate + signed Risk Object + agent-access package;
- using the demo in partner, pilot, accelerator, funding, and acquisition conversations.
