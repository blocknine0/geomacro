# Agentic Commerce Deployment Runbook

Status: **TECHNICAL PROOF. PUBLIC DEPLOYMENT PENDING LAUNCH GATES.**

This runbook covers the Geomacro Risk Gate + Circle x402 Arc Testnet demo. It is separate from institutional pricing, production SLAs, autonomous execution, and GRI methodology.

## 1. Current verified state

The current PR branch has already passed the following gates:

- Product CI on the exact PR head.
- Database Schema Safety.
- Risk Object Key Lifecycle CI.
- Disposable zero-to-current Supabase migration replay.
- Authoritative application Supabase migration deployment through `035`.
- Circle Arc Testnet buyer Agent Wallet funding.
- Circle Gateway buyer balance of at least `0.5 USDC`.
- A separate dedicated Circle Agent Wallet for the Geomacro x402 seller/pay-to role.

Do not claim the x402 demo as publicly live until isolated staging, unpaid x402 verification, real Arc Testnet payment E2E, resilience testing, and the scoped pre-demo security review all pass.

## 2. Exact source branch

```bash
cd /workspaces/geomacro
git fetch origin
git checkout feat/agentic-commerce-demo-current-main
git pull --ff-only origin feat/agentic-commerce-demo-current-main
bun install --frozen-lockfile

git status --short --branch
git rev-parse HEAD
```

The staging runtime must deploy this branch/head, not a stale Lovable preview and not an old preview-deploy branch.

## 3. Authoritative application database

The authoritative application database migration history is now aligned through:

```text
032_risk_gate_audit_data_minimization.sql
033_risk_gate_request_idempotency.sql
034_siwe_single_use_nonce.sql
035_agentic_demo_feedback.sql
```

For future deployment checks:

```bash
export APP_SUPABASE_URL="https://<AUTHORITATIVE_PROJECT_REF>.supabase.co"
bun run db:target
bunx supabase migration list
bunx supabase db push --dry-run
```

After the completed deployment above, an unchanged source tree should not propose those migrations again. Investigate any unexpected migration divergence before applying anything.

Never use `db reset --linked` on production. Do not use `--include-seed` on production. Do not repair migration history merely to make output look clean.

## 4. Circle testnet roles

Use a Circle **testnet** Agent Wallet session.

```bash
circle wallet status --type agent
circle wallet list --chain ARC-TESTNET --type agent
```

Keep separate roles:

```bash
export GEOMACRO_X402_AGENT_WALLET_ADDRESS="0xBUYER_ADDRESS"
export CIRCLE_X402_SELLER_ADDRESS="0xDEDICATED_SELLER_ADDRESS"
```

The seller address must not reuse the AgentArena treasury, prediction-market contract, protocol-fee address, or another unrelated application address.

Never paste private keys, seed phrases, OTPs, access tokens, service-role keys, or signing private keys into chat, screenshots, GitHub issues, or committed files.

## 5. Buyer funding and Gateway balance

Fund the buyer only on Arc Testnet:

```bash
circle wallet fund \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET

circle wallet balance \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

Deposit enough test USDC into Gateway before a paid E2E:

```bash
circle gateway deposit \
  --amount 0.5 \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET \
  --method direct

circle gateway balance \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

The paid demo call is capped at `0.001 USDC`.

## 6. Create isolated Supabase staging

Use a persistent Supabase branch for staging when Branching is available. Do not clone production data merely for convenience.

First inspect existing branches:

```bash
bunx supabase --experimental branches list
```

Create a persistent data-less staging branch:

```bash
bunx supabase --experimental branches create geomacro-staging --persistent
```

Do **not** add `--with-data`.

Then inspect it:

```bash
bunx supabase --experimental branches list
bunx supabase --experimental branches get geomacro-staging
```

Record the staging branch project ref and obtain its branch-specific API URL and keys from the Supabase dashboard. Staging credentials must be different from production credentials.

If the staging database has no validated demo Risk Objects, create explicit non-production staging fixtures. Do not silently point staging tests at the production database.

## 7. Staging runtime configuration

The application staging runtime must deploy the exact PR head and use staging application-database credentials.

Required server-side configuration includes the same Risk Gate/readiness dependencies plus:

```text
CIRCLE_X402_SELLER_ADDRESS=0xDEDICATED_SELLER_ADDRESS
HISTORICAL_SUPABASE_URL=...
HISTORICAL_SUPABASE_SERVICE_ROLE_KEY=...
```

Configure Risk Object signing and verification-key lifecycle variables exactly as documented in `.env.example`.

Never expose server-only values through a `VITE_` prefix.

The historical warehouse remains evidence-only. Missing historical credentials/data must surface as unavailable/not-configured, never as zero risk.

## 8. Unpaid x402 contract verification

Run this before authorizing any payment:

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
bun run agentic:x402:e2e
```

A pass requires:

- HTTP `402`.
- `PAYMENT-REQUIRED`.
- x402 version `2`.
- Arc Testnet `eip155:5042002`.
- Arc Testnet USDC `0x3600000000000000000000000000000000000000`.
- atomic price `1000` = `0.001 USDC`.
- Gateway verification contract `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`.
- timeout at least `604900` seconds.

Optional manual inspection:

```bash
circle services inspect \
  https://<staging-host>/api/agent/risk \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"subject":{"type":"corridor","origin_country_iso3":"USA","destination_country_iso3":"CHN"},"policy_preset":"cautious","action_type":"agent_payment","amount_usdc":10000}'
```

## 9. Real Arc Testnet payment E2E

Only after the unpaid check passes:

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
GEOMACRO_X402_AGENT_WALLET_ADDRESS="$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
GEOMACRO_X402_E2E_ACK=ARC_TESTNET_USDC \
bun run agentic:x402:e2e
```

The acknowledgement authorizes one Arc Testnet payment capped at `0.001 USDC`. The harness refuses `geomacro.live` and `www.geomacro.live`.

Equivalent manual Circle CLI payment:

```bash
circle services pay \
  https://<staging-host>/api/agent/risk \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET \
  --max-amount 0.001 \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"subject":{"type":"corridor","origin_country_iso3":"USA","destination_country_iso3":"CHN"},"policy_preset":"cautious","action_type":"agent_payment","amount_usdc":10000}' \
  --output json
```

A successful paid resource must still contain:

```text
execution_authorized=false
```

and identify the payment provider as:

```text
circle_gateway_x402
```

If payment fails, inspect Circle CLI debug logs under `~/.circle-cli/payments/`.

## 10. Post-payment and feedback checks

Re-check buyer Gateway balance:

```bash
circle gateway balance \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

Do not claim one onchain settlement transaction per API call; Gateway settlement may be batched.

Submit one non-sensitive feedback entry through staging `/demo` and verify that the stored row contains no IP address, raw wallet address, raw payment payload, or raw request body.

## 11. Resilience and security gates

After x402 E2E passes:

1. Point the existing Risk Gate load harness only at isolated staging.
2. Keep `RISK_GATE_LOAD_TEST_ACK=STAGING_ONLY` enabled.
3. Preserve request count, p50/p95/p99 latency, status distribution, error rate, and limitations.
4. Exercise relevant dependency-failure cases.
5. Run the scoped pre-demo security review.
6. Fix and re-test every critical/high finding.
7. Preserve evidence for launch-readiness reporting.

Staging results are not a production SLA.

## 12. Public-launch decision

Only after all gates pass should Geomacro consider:

- adding `/demo` to the public sitemap;
- changing technical-proof wording to a public-live claim;
- updating Circle / Julie with the concrete milestone;
- re-engaging Dan with the Risk Gate + signed Risk Object + agent-access package;
- using the demo in partner, pilot, accelerator, funding, and acquisition conversations.

## Product boundary

The x402 rail is an access/payment mechanism around a Geomacro risk resource. It does not alter GRI v1.2, bypass source-rights controls, authorize execution, make Geomacro a wallet custodian, or turn Risk Gate into an autonomous transaction signer.
