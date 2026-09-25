# Agentic Testnet Acceptance v1

## Purpose

`Agentic Testnet Acceptance v1` is the canonical pre-mainnet economic-loop gate for the Geomacro Arc Testnet x402 technical-proof surface.

It proves that a software agent can discover Geomacro, enforce a fixed spend policy, fund/check its Circle Gateway balance, pay exactly one bounded Testnet USDC charge, receive the governed intelligence response, independently verify the signed Geomacro Risk Object, apply the non-executing Risk Gate boundary, retry safely, reject payment/request replay conflicts, and preserve sanitized audit evidence without a human inside the transaction loop.

This gate is **Testnet only**. It does not authorize mainnet, commercial revenue, wallet custody, transaction execution, or autonomous downstream action.

## Canonical surface

- resource: `POST /api/agent/risk`
- discovery: `GET /api/agent/risk` and `/.well-known/geomacro-agent.json`
- trust registry: `GET /api/risk-object-keys`
- payment protocol: x402 v2
- network: Arc Testnet, `eip155:5042002`
- asset: Arc Testnet USDC, `0x3600000000000000000000000000000000000000`
- Circle Gateway verifying contract: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- seller price: exactly `0.001` test USDC / `1000` atomic units
- commercial revenue: `false`
- Risk Gate `execution_authorized`: always `false`

## P0 acceptance map

| Gate | Requirement | Evidence in v1 |
| --- | --- | --- |
| P0-1 | Service discovery | Agent manifest resolves the exact target endpoint and preserves the non-executing boundary. |
| P0-2 | Autonomous agent wallet | Dedicated EVM buyer key is loaded only from the Actions secret and used by `GatewayClient`. |
| P0-3 | Testnet USDC funding | Gateway balance is checked; when below the quote the harness can auto-deposit up to `0.01` test USDC. |
| P0-4 | Automatic HTTP 402 handling | Harness obtains and decodes `PAYMENT-REQUIRED`, validates x402 v2, then `GatewayClient.pay()` performs the paid retry. |
| P0-5 | Arc settlement | Network, USDC contract, Gateway metadata and settlement reference are required. |
| P0-6 | Payment → request binding | Seller validates the complete accepted requirement and the provider-neutral ledger binds payment fingerprint to normalized request fingerprint. |
| P0-7 | Risk Object delivery | Successful paid response must include a signed `risk_object`. |
| P0-8 | Signature verification | Harness independently reproduces canonical JSON + SHA-256 + Ed25519 verification using `/api/risk-object-keys`; a score tamper must fail. |
| P0-9 | Risk Gate | Paid response must contain a Risk Gate decision with `execution_authorized=false`. |
| P0-10 | Replay/idempotency | Exact captured payment proof replay returns the stored payload with `idempotent_replay=true`; no new settlement is attempted. |
| P0-11 | Invalid payment rejection | Wrong amount, network, recipient and a post-payment tampered requirement fail closed before another settlement. |
| P0-12 | Spend limits | Harness refuses quotes over its configured budget and hard-limits the budget to `0.01` test USDC; canonical run uses `0.001`. |
| P0-13 | Retry safety / no double spend | Only one `GatewayClient.pay()` call is allowed; exact retries reuse the captured proof and must preserve the same settlement reference. |
| P0-14 | Audit evidence | Sanitized JSON records request/settlement/Risk Gate/signature/balance evidence; private key and raw payment signature are explicitly never persisted. |
| P0-15 | Canonical no-human acceptance | The run marks PASS only after P0-1 through P0-14 pass in one process. |

## Seller-side state machine

The Arc route now uses the provider-neutral `agent_commerce_deliveries` ledger.

The required order is:

1. validate request and prove the risk resource is deliverable;
2. return HTTP 402 when payment is absent;
3. decode and strictly bind the x402 payment requirement;
4. fingerprint payment and normalized request;
5. claim the durable delivery record;
6. reject conflict, in-progress or reconciliation-required states;
7. return a stored response immediately for an exact delivered replay;
8. verify the payment with Circle Gateway;
9. durably prepare the exact response before settlement;
10. settle once;
11. durably complete the delivery with the settlement reference;
12. return the paid response and persist secondary telemetry.

A settlement exception after durable prepare is treated as ambiguous. The payment proof is moved to manual-review state and automatic re-charge is blocked. A post-settlement ledger-completion failure also fails closed rather than opening a second charge path.

## Automated regression gate

Pull requests touching this acceptance surface run:

```bash
bun test src/__tests__/agentic-testnet-acceptance-v1.test.ts
bun run build
```

The static gate moves no funds.

## Canonical paid gate

GitHub Actions workflow:

```text
Agentic Testnet Acceptance v1
```

Select `paid-e2e` on canonical `main` and provide the exact acknowledgement:

```text
ARC_TESTNET_USDC_AGENTIC_ACCEPTANCE_V1
```

The repository Actions secret required by the paid gate is:

```text
ARC_TESTNET_AGENTIC_ACCEPTANCE_PRIVATE_KEY
```

The key must belong to a dedicated Arc Testnet-only buyer wallet. Never reuse a production/mainnet treasury key. The wallet must have enough Arc Testnet USDC to support an optional Gateway deposit. The harness can move at most `0.01` test USDC into Gateway when the Gateway balance is below the `0.001` quote.

The paid workflow stores its sanitized result under:

```text
artifacts/agentic-testnet-acceptance-v1/*.json
```

and uploads it as a 90-day GitHub Actions artifact.

## PASS definition

The final gate is PASS only when the paid workflow artifact has:

- `status: "PASS"`;
- every P0-1 through P0-15 entry marked `PASS`;
- exactly one paid Gateway call;
- `duplicate_charge_count: 0`;
- a non-empty settlement reference;
- a valid Risk Object signature and rejected tamper attempt;
- the exact replay marked idempotent with the same settlement reference;
- changed-request replay rejected with `X402_PAYMENT_REPLAY_CONFLICT`;
- observed Gateway balance delta within the configured `0.001` seller-spend budget;
- no private key and no raw `PAYMENT-SIGNATURE` in evidence.

## Mainnet boundary

Do not treat the static gate, an unpaid 402 check, or a build-only CI run as final Testnet acceptance.

Mainnet remains blocked until a deployed canonical `main` revision has produced a **successful paid `Agentic Testnet Acceptance v1` artifact**. Mainnet launch still requires the separate commercial/legal/provider/reconciliation gates already defined elsewhere in the repository; this acceptance does not replace them.
