# Agentic Commerce Deployment Runbook

Status: **TECHNICAL PROOF. PUBLIC DEPLOYMENT PENDING LAUNCH GATES.**

This runbook covers the Geomacro Risk Gate + Circle x402 Arc Testnet demo. It is intentionally separate from institutional pricing, production SLAs, autonomous execution, and GRI methodology.

## 1. Preconditions

Do not deploy the paid x402 route publicly until all of the following are true:

- Product CI passes on the exact commit being deployed.
- Database schema safety passes, including disposable zero-to-current migration replay.
- Risk Object Key Lifecycle CI passes on the exact commit being deployed.
- `035_agentic_demo_feedback.sql` has been reviewed and applied to the authoritative application Supabase project.
- `CIRCLE_X402_SELLER_ADDRESS` is configured with a dedicated Arc Testnet EVM address.
- Geomacro Risk Object signing and verification-key lifecycle configuration is healthy.
- `HISTORICAL_SUPABASE_URL` and `HISTORICAL_SUPABASE_SERVICE_ROLE_KEY` are configured if structural evidence is expected in the demo runtime.
- an isolated staging hostname/runtime exists. Do not use `geomacro.live` for load or paid E2E testing.

## 2. Checkout the exact PR branch

```bash
cd /workspaces/geomacro
git fetch origin
git checkout feat/agentic-commerce-demo-current-main
git pull --ff-only origin feat/agentic-commerce-demo-current-main
bun install --frozen-lockfile
```

Before continuing, confirm the branch and head:

```bash
git status --short --branch
git rev-parse HEAD
```

## 3. Authoritative database migration

Never apply migrations by pasting the SQL directly into the production SQL editor when the repository is already using migration history. Supabase recommends linking the CLI and deploying through `db push` so migration history remains synchronized.

### 3.1 Authenticate and link

```bash
supabase login
supabase link --project-ref <AUTHORITATIVE_PROJECT_REF>
```

The project ref is visible in the Supabase dashboard URL for the intended Geomacro application project.

### 3.2 Load only the non-secret project URL for the repository target guard

```bash
export APP_SUPABASE_URL="https://<AUTHORITATIVE_PROJECT_REF>.supabase.co"
bun run db:target
```

`db:target` must print a successful authoritative-target check. Stop immediately if it reports a mismatch.

### 3.3 Compare migration history

```bash
supabase migration list
```

The remote history should already contain the production baseline and earlier migrations. Do not repair migration history merely to make the output look clean; investigate any unexpected divergence first.

### 3.4 Dry-run the deployment

```bash
supabase db push --dry-run
```

For this PR, the expected new application migration is:

```text
035_agentic_demo_feedback.sql
```

If the dry run proposes unrelated or unexpected migrations, stop and investigate before applying anything.

### 3.5 Apply the pending migration

```bash
supabase db push
```

Do **not** use `--include-seed` on the production database.

### 3.6 Verify migration state

```bash
supabase migration list
```

Then verify through the application database that `public.agentic_demo_feedback` exists, has RLS enabled, and is not directly writable by `anon` or `authenticated` roles.

## 4. Circle CLI testnet wallet setup

Use Circle CLI's **testnet** wallet session. Do not paste private keys into commands, chat, screenshots, GitHub issues, or environment files committed to git.

### 4.1 Login to the Circle testnet wallet session

```bash
circle wallet login <YOUR_CIRCLE_EMAIL> --testnet
```

Complete the email OTP flow when prompted.

Check the session:

```bash
circle wallet status --type agent
```

### 4.2 List Arc Testnet agent wallets

```bash
circle wallet list --chain ARC-TESTNET --type agent
```

Use one existing testnet agent wallet as the **buyer/agent wallet**. Record its public `0x...` address locally as:

```bash
export GEOMACRO_X402_AGENT_WALLET_ADDRESS="0xBUYER_ADDRESS"
```

This is a public wallet address, not a private key.

### 4.3 Create a dedicated seller wallet if needed

If every existing wallet is already used for another purpose, create an additional testnet agent wallet:

```bash
circle wallet create --type agent --testnet
circle wallet list --chain ARC-TESTNET --type agent
```

Choose the new address as the dedicated Geomacro x402 seller/pay-to address and record it locally:

```bash
export CIRCLE_X402_SELLER_ADDRESS="0xSELLER_ADDRESS"
```

Do not silently reuse the AgentArena treasury, market contract, protocol-fee address, or another unrelated application address.

## 5. Fund the buyer and Gateway balance

### 5.1 Fund the Arc Testnet buyer wallet from Circle's testnet faucet

```bash
circle wallet fund \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

On testnet, Circle CLI's `wallet fund` uses the Circle faucet when `--method` and `--amount` are omitted.

Check the wallet balance:

```bash
circle wallet balance \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

### 5.2 Deposit USDC into Circle Gateway

Circle's current CLI requires a minimum Gateway deposit of `0.5` USDC. For this technical proof, use the direct method:

```bash
circle gateway deposit \
  --amount 0.5 \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET \
  --method direct
```

Check the Gateway balance:

```bash
circle gateway balance \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

Do not continue to the paid E2E until the Gateway available balance is sufficient for the `0.001 USDC` test call.

## 6. Configure the staging runtime

The staging runtime must run this PR branch, not the stale Lovable preview and not the production `geomacro.live` deployment.

Required server-side variables include the same application/readiness dependencies used by Risk Gate, plus:

```text
CIRCLE_X402_SELLER_ADDRESS=0xSELLER_ADDRESS
HISTORICAL_SUPABASE_URL=...
HISTORICAL_SUPABASE_SERVICE_ROLE_KEY=...
```

Risk Object signing/verification variables must also be configured exactly as documented in `.env.example`.

Never expose server-only credentials with a `VITE_` prefix.

### Preferred isolation

Use a separate staging/preview Supabase environment with its own API credentials. Supabase Branching is suitable when available: each branch has an isolated database/API environment. Production data is not copied by default and should not be copied merely for convenience.

If the staging database has no validated demo Risk Objects, create explicit non-production staging fixtures rather than silently querying or load-testing the production database.

## 7. Unpaid x402 contract verification

Run the guarded repository harness first. This stage performs no payment:

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
bun run agentic:x402:e2e
```

A pass requires:

- HTTP 402
- `PAYMENT-REQUIRED`
- x402 version 2
- Arc Testnet network `eip155:5042002`
- Arc Testnet USDC `0x3600000000000000000000000000000000000000`
- atomic test price `1000` = `0.001 USDC`
- Gateway verification contract `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- Gateway-compatible timeout of at least `604900` seconds

You can also inspect the requirements manually with Circle CLI:

```bash
circle services inspect \
  https://<staging-host>/api/agent/risk \
  -X POST \
  -H 'content-type: application/json' \
  -d '{"subject":{"type":"corridor","origin_country_iso3":"USA","destination_country_iso3":"CHN"},"policy_preset":"cautious","action_type":"agent_payment","amount_usdc":10000}'
```

## 8. Real Arc Testnet payment E2E

Only run this after the unpaid check passes and the buyer's Gateway balance is funded.

### 8.1 Guarded repository E2E

```bash
GEOMACRO_X402_BASE_URL=https://<staging-host> \
GEOMACRO_X402_EXPECTED_HOST=<staging-host> \
GEOMACRO_X402_AGENT_WALLET_ADDRESS="$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
GEOMACRO_X402_E2E_ACK=ARC_TESTNET_USDC \
bun run agentic:x402:e2e
```

The explicit acknowledgement authorizes one Arc Testnet payment capped at `0.001 USDC`. The harness refuses `geomacro.live` and `www.geomacro.live` as payment targets.

### 8.2 Equivalent manual Circle CLI payment

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

A pass requires a successful paid resource response that still contains:

```text
execution_authorized=false
```

and identifies the payment provider as:

```text
circle_gateway_x402
```

If Circle CLI reports a payment failure, inspect its payment debug logs under:

```text
~/.circle-cli/payments/
```

## 9. Verify Gateway balance after payment

```bash
circle gateway balance \
  --address "$GEOMACRO_X402_AGENT_WALLET_ADDRESS" \
  --chain ARC-TESTNET
```

The buyer's available Gateway balance should reflect the test payment after the relevant Gateway accounting/settlement state updates.

Seller receipts are Gateway-settled/batched; do not claim an immediate one-transaction-per-call onchain settlement.

## 10. Feedback endpoint verification

After migration 035 is present in the staging/application database, submit one non-sensitive test feedback entry through `/demo` and verify:

- row inserted successfully;
- no IP address is stored;
- no raw wallet address is stored;
- no raw payment payload is stored;
- no raw request body is stored.

## 11. Resilience and security gates

After x402 E2E passes:

1. configure the existing Risk Gate staging load harness against the isolated staging URL and staging API key;
2. keep `RISK_GATE_LOAD_TEST_ACK=STAGING_ONLY` enabled as required by the harness;
3. run the agreed HTTP resilience profile;
4. preserve request counts, p50/p95/p99 latency, status distribution, error rate, and limitations;
5. run dependency-failure cases relevant to the staging runtime;
6. run the scoped pre-demo security review;
7. fix and re-test all critical/high findings;
8. preserve evidence for launch-readiness reporting.

Never interpret staging results as a production SLA unless a later production SLO/SLA program establishes one.

## 12. Public-launch decision

Only after the launch gates pass should the team decide to:

- add `/demo` to the public sitemap;
- change technical-preview wording to a public-live claim;
- send the concrete milestone update to Circle / Julie;
- re-engage Dan with the Risk Gate + signed Risk Object + agent-access package;
- use the demo in accelerator, partner, funding, and acquisition conversations.

## Product boundary

The x402 rail is an access/payment mechanism around a Geomacro risk resource. It does not alter GRI v1.2, does not bypass source-rights controls, and never changes Risk Gate into a wallet custodian or autonomous transaction signer.
