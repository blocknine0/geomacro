# Geomacro Mainnet x402 Pay-Per-Call Blocker Register

Status: **PRELAUNCH · REAL FUNDS DISABLED**

This register is the release-candidate truth for the initial Coinbase Base mainnet pay-per-call rail.

## Completed repository-side controls

- Coinbase x402 Base mainnet contract is pinned to `eip155:8453`, canonical Base USDC, exact `0.05` USDC / `50,000` atomic units.
- Payment binding checks network, asset, amount and receiver.
- Request/payment fingerprints are deterministic.
- Delivery ledger claims are replay-safe and concurrency-safe.
- Prepared payloads are durable before external settlement.
- Ambiguous settlement is manual-review / reconciliation, not automatic recharge.
- Paid intelligence structured-response validation occurs before settlement.
- `execution_authorized=false` is enforced at the paid response boundary.
- Delivered product hash is recomputed and compared before settlement.
- Base Sepolia paid E2E verifies the actual USDC Transfer log for token, payer, receiver and exact amount.
- Public x402 discovery remains prelaunch and does not advertise production paid resources before authorization.
- Website lock remains intact.
- Product, Agent Query, Global Intelligence, Hosting Alignment, Coinbase Mainnet Readiness and Commercial Preflight checks have passed on the reviewed candidate in the observed CI waves.

## External blockers that must be cleared before paid operation

### 1. Historical structural warehouse is not configured in production runtime

Live no-charge availability currently fails because `HISTORICAL_SUPABASE_URL` and `HISTORICAL_SUPABASE_SERVICE_ROLE_KEY` are not present in the production runtime/CI environment.

The governed structural serving views are also absent from the authoritative application Supabase project. The application DB probe returned PostgREST `PGRST205` for `commercial_structural_country_profiles` and related serving data.

Required action:

- configure the dedicated historical warehouse server-side;
- verify the governed serving relations exist there;
- verify representative country/corridor rows and timestamps;
- rerun the live no-charge availability gate.

Do not expose these credentials to browser code or source control.

### 2. Canonical paid Risk Objects are not currently fresh under the active signing generation

Production DB observations show recent objects signed with retired `geomacro-risk-2026-02`; representative rows for USA/IND/CHN are expired or otherwise not eligible for current canonical paid delivery.

A manual fail-closed canonical refresh workflow now exists:

`.github/workflows/canonical-risk-object-production-refresh.yml`

It requires the explicit data-publication acknowledgement:

`I_AUTHORIZE_CANONICAL_RISK_OBJECT_REFRESH`

and validates `CANONICAL`, `gro-1.1`, active key `geomacro-risk-2026-03`, signature validity, commercial eligibility and verification.

### 3. Hot-topic pipeline / live structured events must pass the paid freshness contract

The paid availability gate requires the hot-topic pipeline to be healthy and fresh, with commercially deliverable structured events. The current live availability evidence still reports hot-topic as missing for representative queries.

Required action:

- run/repair the existing production realtime ingestion path;
- obtain a passing `scripts/audit-agent-hot-topic-readiness.ts --require-pipeline-healthy` result;
- rerun live x402 availability.

### 4. Final production activation remains deliberately locked

Production settlement still requires the existing coordinated owner acknowledgements and server-only production CDP credentials.

Required production values include:

`COINBASE_X402_ENVIRONMENT=production`
`COINBASE_X402_PAY_TO=<dedicated Base mainnet receiver>`
`COINBASE_X402_PRICE_USDC=0.05`
`CDP_API_KEY_ID=<production credential>`
`CDP_API_KEY_SECRET=<production credential>`
`GEOMACRO_CENTRAL_SECURITY_MODE=enforce`
`GEOMACRO_REAL_FUNDS_SECURITY_ACK=I_ACCEPT_REAL_FUNDS_SECURITY_GATES`
`GEOMACRO_SECURITY_FINGERPRINT_PEPPER=<32+ chars>`
`GEOMACRO_API_CREDENTIAL_PEPPER=<32+ chars>`
`GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`
`COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`

No secret or private key belongs in chat, source control, public logs or public discovery.

### 5. Strict final acceptance is a separate manual evidence chain

The existing final production acceptance workflow requires the exact current main SHA plus successful P0 strict closure, private-ledger readiness, canary/safety evidence and marketplace/prelisting evidence according to its workflow contract.

No run is being represented here as complete unless its exact run ID is actually successful.

## Release rule

The system must remain **prelaunch** while any blocker above is unresolved.

Passing the repository-side contract suite does not, by itself, authorize real-money settlement.

The first external production purchase can become revenue evidence only after exact payment settlement, delivery reconciliation, replay safety and the required production gates have all passed.
