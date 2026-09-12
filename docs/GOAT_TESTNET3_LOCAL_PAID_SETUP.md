# GOAT Testnet3 local paid E2E setup

This is the preferred paid-proof path for Geomacro because it runs the current repository source on an isolated GitHub Actions loopback server. It does not require a separate staging domain or Lovable publish step.

## Safety model

- Network: GOAT Testnet3 only (`eip155:48816`)
- Commercial revenue: false
- Mainnet commercial gate: false
- Public `geomacro.live` is not used as the paid harness target
- The paid workflow requires exact manual acknowledgement `GOAT_TESTNET3_USDC`
- The readiness workflow never loads the payer private key into the test runtime and never submits a transfer
- Use a dedicated Testnet-only wallet. Do not use a treasury/main wallet.

## GitHub environment

Repository -> Settings -> Environments -> `goat-testnet3-paid-proof`

Add these as **Environment secrets**, not variables:

| Secret | Source / purpose |
|---|---|
| `GOATX402_API_KEY` | GOAT Flow Testnet3 merchant credential |
| `GOATX402_API_SECRET` | GOAT Flow Testnet3 merchant credential |
| `GOATX402_MERCHANT_ID` | GOAT Flow Testnet3 merchant identifier |
| `GEOMACRO_GOAT_PILOT_ACCESS_TOKEN` | Geomacro-only bearer token for `/api/goat/pilot/*`; generate a random 32-byte-or-longer secret and keep it server-only |
| `APP_SUPABASE_URL` | Existing authoritative Geomacro application Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing authoritative Geomacro service-role key; workflow maps this to `APP_SUPABASE_SERVICE_ROLE_KEY` |
| `RISK_OBJECT_SIGNING_KEY_ID` | Current Risk Object signing generation; current workflow expects `geomacro-risk-2026-02` |
| `RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64` | Current server-only Ed25519 Risk Object signing private key |
| `GEOMACRO_GOAT_TEST_PAYER_ADDRESS` | Public address of the dedicated GOAT Testnet3 payer wallet |
| `GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY` | Private key of the dedicated Testnet-only payer wallet; never paste into chat/issues/logs |

Do **not** add `GEOMACRO_GOAT_PILOT_BASE_URL` or `GEOMACRO_GOAT_PILOT_EXPECTED_HOST` for the local workflow. They are fixed by the workflow to `http://127.0.0.1:4173` and `127.0.0.1`.

## Where each value comes from

### GOAT merchant credentials

Use the same Testnet3 merchant credentials already used by the successful `GOAT Testnet3 Provider Dry Run` workflow. If these are already repository/environment secrets, reuse the same values in the protected `goat-testnet3-paid-proof` environment rather than copying them into source files.

### Geomacro pilot access token

This is not issued by GOAT. Generate it locally and add only the generated value to the GitHub Environment secret.

Example local command:

```bash
openssl rand -hex 32
```

Do not commit the output and do not post it in chat.

### Supabase and Risk Object signing secrets

Reuse the current trusted server-side values already used by Geomacro's signed Risk Object pipeline. Do not create a second signing identity solely for this proof unless key rotation is intentionally planned.

### Dedicated Testnet payer wallet

Create a fresh EVM wallet used only for GOAT Testnet3 proof. Record its public `0x...` address as `GEOMACRO_GOAT_TEST_PAYER_ADDRESS` and its private key as the protected `GEOMACRO_GOAT_TEST_PAYER_PRIVATE_KEY` Environment secret.

Fund it with:

1. Enough merchant-supported Testnet3 USDC for one test payment. The current local proof asks Geomacro for `100000` atomic units, but the runtime GOAT challenge remains authoritative.
2. Enough GOAT Testnet3 native gas token for the ERC-20 transfer.

## Step 1: run readiness, no payment

GitHub -> Actions -> `GOAT Testnet3 Local Paid Readiness` -> Run workflow.

This workflow:

- verifies required secret names are present without printing values;
- verifies the current signing key can derive an Ed25519 public key;
- refreshes signed USA/CHN corridor intelligence;
- boots the current repository on isolated loopback;
- executes the existing E2E harness with payment acknowledgement and private key explicitly unset;
- requires a valid 402 `PAYMENT_REQUIRED` challenge and no premium delivery;
- uploads sanitized challenge evidence for 90 days;
- submits no transaction.

Do not move to the paid workflow unless this run is green.

## Step 2: run exactly one paid Testnet3 E2E

GitHub -> Actions -> `GOAT Testnet3 Local Paid E2E Proof` -> Run workflow.

For `confirmation`, type exactly:

```text
GOAT_TESTNET3_USDC
```

Use a unique `client_request_id`, for example:

```text
geomacro-goat-paid-e2e-20260912-01
```

The workflow then verifies the Testnet3 challenge, checks the dedicated wallet balance, submits one Testnet3 USDC transfer, waits for the receipt, polls GOAT-backed order status, reconciles the exact transaction, delivers the structured Risk Object, verifies its public cryptographic signature, and uploads sanitized evidence for 90 days.

## Critical retry rule

If a transfer was broadcast and the workflow later times out or fails during provider reconciliation, **do not run another paid workflow with a new payment immediately**. First reconcile the same order/request/transaction. The harness intentionally fails with this instruction to prevent duplicate payment.

## Evidence to preserve

For the final GOAT Mainnet/funding package preserve:

- GitHub Actions run URL and run ID
- challenge artifact
- transfer artifact
- final delivery artifact
- Testnet3 transaction hash
- GOAT order/payment identity
- chain, token, amount, pay-to recipient and payer
- Risk Object verification result
- Order Reconciliation portal evidence for the same transfer
- any failure/remediation evidence

## What this does not prove

A successful Testnet3 paid E2E is not Mainnet approval, commercial revenue, a production SLA, or proof of Mainnet merchant configuration. Mainnet values and capabilities must be reviewed from the live GOAT Mainnet merchant environment after approval.
