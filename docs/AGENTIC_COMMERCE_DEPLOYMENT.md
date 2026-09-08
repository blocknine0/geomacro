# Agentic Commerce Deployment Runbook

Status: **TECHNICAL PROOF. PUBLIC DEPLOYMENT PENDING LAUNCH GATES.**

This runbook covers the Geomacro Risk Gate + Circle x402 Arc Testnet demo. It is intentionally separate from institutional pricing, production SLAs, autonomous execution, and GRI methodology.

## 1. Preconditions

Do not deploy the paid x402 route publicly until all of the following are true:

- Product CI passes on the exact commit being deployed.
- Database schema safety passes, including disposable zero-to-current migration replay.
- `035_agentic_demo_feedback.sql` has been reviewed and applied to the authoritative application Supabase project.
- `CIRCLE_X402_SELLER_ADDRESS` is configured with a dedicated Arc Testnet EVM address.
- Geomacro Risk Object signing and verification-key lifecycle configuration is healthy.
- `HISTORICAL_SUPABASE_URL` and `HISTORICAL_SUPABASE_SERVICE_ROLE_KEY` are configured if structural evidence is expected in the demo runtime.
- an isolated staging hostname exists. Do not use `geomacro.live` for load or paid E2E testing.

## 2. Database deployment

Before any database operation, verify the intended target:

```bash
bun run db:target
```

The target guard fails closed unless the configured Supabase URL resolves to the authoritative project ref expected by the repository.

Then use the repository's reviewed Supabase deployment path to apply pending migrations. Do not paste service-role keys into shell history, PRs, issues, screenshots, logs, or chat.

After deployment, verify that `agentic_demo_feedback` exists with RLS enabled and that anonymous/authenticated roles do not have direct table privileges.

## 3. x402 seller configuration

Set the server-only environment variable:

```text
CIRCLE_X402_SELLER_ADDRESS=0x...
```

Requirements:

- valid 20-byte EVM address
- dedicated to this Arc Testnet x402 technical proof
- not silently reused from unrelated treasury, market, or protocol contracts
- no private key is stored in this variable

The paid route fails with HTTP 503 when this variable is missing or invalid.

## 4. Isolated staging verification

Deploy the branch to an isolated HTTPS staging host with the same server-side data and signing dependencies required by the demo.

Run the unpaid contract check first:

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
bun run agentic:x402:e2e
```

This stage performs **no payment**. It requires:

- HTTP 402
- `PAYMENT-REQUIRED`
- x402 version 2
- Arc Testnet network `eip155:5042002`
- Arc Testnet USDC `0x3600000000000000000000000000000000000000`
- atomic test price `1000` = `0.001 USDC`
- Gateway verification contract `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- Gateway-compatible timeout of at least 604900 seconds

## 5. Real Arc Testnet payment E2E

Only run this after the unpaid check passes and the Circle CLI wallet has Arc Testnet USDC available.

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
GEOMACRO_X402_AGENT_WALLET_ADDRESS=0x... \
GEOMACRO_X402_E2E_ACK=ARC_TESTNET_USDC \
bun run agentic:x402:e2e
```

The explicit acknowledgement is required because this stage authorizes one real Arc Testnet payment capped at `0.001 USDC`.

The harness refuses `geomacro.live` and `www.geomacro.live` as payment targets.

A pass requires the paid response to preserve:

```text
execution_authorized=false
```

and identify the payment provider as:

```text
circle_gateway_x402
```

## 6. Resilience and security gates

After x402 E2E passes:

1. configure the existing Risk Gate staging load harness against the isolated staging URL and staging API key;
2. run the agreed HTTP resilience profile;
3. preserve request counts, p50/p95/p99 latency, status distribution, error rate, and limitations;
4. run the scoped pre-demo security review;
5. fix and re-test all critical/high findings;
6. preserve evidence for launch-readiness reporting.

Never interpret staging results as a production SLA unless a later production SLO/SLA program establishes one.

## 7. Public-launch decision

Only after the launch gates pass should the team decide to:

- add `/demo` to the public sitemap;
- change technical-preview wording to a public-live claim;
- send the concrete milestone update to Circle / Julie;
- re-engage Dan with the Risk Gate + signed Risk Object + agent-access package;
- use the demo in accelerator, partner, funding, and acquisition conversations.

## Product boundary

The x402 rail is an access/payment mechanism around a Geomacro risk resource. It does not alter GRI v1.2, does not bypass source-rights controls, and never changes Risk Gate into a wallet custodian or autonomous transaction signer.
