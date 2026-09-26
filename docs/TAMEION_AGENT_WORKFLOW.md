# Geomacro Tameion Agent Mode

Status: Arc Testnet hackathon workflow. This is not a mainnet authorization or custody system.

## Submission direction

Primary fit: RFB 4, Autonomous Business Operator.

Secondary alignment: RFB 5, Compliance Intelligence Agent.

Geomacro already supplies signed geopolitical risk context and a Circle x402 pay-per-call proof on Arc Testnet. Tameion Agent Mode adds a bounded business-policy layer that converts the advisory Risk Gate result and payment amount into one of three explicit outcomes:

- `AUTO_EXECUTE`
- `REQUIRE_APPROVAL`
- `BLOCK`

The permanent Geomacro Risk Gate boundary does not change:

```text
execution_authorized=false
```

The Tameion layer is customer-side policy orchestration around that advisory result. It never changes a Risk Gate response to `execution_authorized=true`.

## End-to-end flow

```text
Payment intent
  -> canonical signed Geomacro country/corridor Risk Object
  -> Risk Gate policy evaluation
  -> bounded Tameion business policy
       -> AUTO_EXECUTE
       -> REQUIRE_APPROVAL -> exact wallet signature
       -> BLOCK
  -> customer wallet sends native USDC on Arc Testnet
  -> server verifies tx hash, recipient, amount and successful receipt
  -> private audit ledger marks EXECUTED
```

## Spending limits

| Preset | Auto-execute max | Human-approval max |
| --- | ---: | ---: |
| Balanced | 25 USDC | 250 USDC |
| Cautious | 10 USDC | 100 USDC |
| Strict | 2 USDC | 25 USDC |

A Risk Gate `PAUSE/BLOCK` always blocks regardless of amount. A Risk Gate `REQUIRE_APPROVAL` or `REDUCE_LIMIT` always requires human approval. Amounts above the human-approval ceiling are blocked.

These are hackathon/testnet policy presets, not production treasury limits.

## Human approval binding

The approval signature is gasless and binds the approver to exactly:

- audit decision UUID;
- recipient address;
- USDC amount;
- Arc Testnet chain identity;
- decision expiration time.

The server verifies the signature and stores only a SHA-256 reference for the approver address. No private key is stored.

## Arc Testnet payment verification

Arc Testnet uses native USDC with 18 on-chain decimals in this codebase. The browser wallet sends a native-value transaction. The server then independently reads the transaction and receipt from Arc Testnet and requires:

1. a successful receipt;
2. exact recipient match;
3. exact native value match with the stored payment intent;
4. a still-valid decision in `AUTO_EXECUTE_READY` or `HUMAN_APPROVED` state.

Only then is the private audit row changed to `EXECUTED`.

## Private audit evidence

Migration `980_tameion_agent_workflow.sql` creates `tameion_agent_decisions` with service-role-only access. It records:

- subject and action context;
- policy preset and limits;
- Risk Object ID and score;
- Risk Gate decision and advisory action;
- Tameion agent action and reasons;
- exact amount/recipient intent;
- human approval timestamp and hashed approver reference when applicable;
- verified Arc tx hash, block number and hashed payer reference;
- immutable decision snapshot fields needed for demo evidence.

Raw wallet signatures and private keys are not stored.

## Existing Circle x402 evidence

Geomacro's existing `/api/agent/risk` flow already implements Circle Gateway x402 on Arc Testnet, including HTTP 402 payment requirements, verification, settlement, replay protection and paid resource delivery. `docs/LAUNCH_READINESS_AGENTIC_DEMO.md` records a previously passed acknowledged `0.001 USDC` Arc Testnet x402 regression.

Tameion Agent Mode does not replace that path. It demonstrates a separate business-payment workflow while the existing x402 route remains available as evidence of agent-paid intelligence access.

## Demo route

After deployment:

```text
https://geomacro.live/tameion
```

Recommended demo sequence:

1. Open `/tameion`.
2. Select United States -> China or a country test case.
3. Choose a business policy and payment amount.
4. Run the agent decision.
5. Show Risk Gate result, spending limits, audit ID and `execution_authorized=false` boundary.
6. If the result requires approval, connect a wallet and sign the exact human-approval message.
7. Execute the Arc Testnet USDC payment.
8. Show the verified tx hash and Arc Testnet explorer record.
9. Briefly show `/demo` or `/api/agent/risk` as the separate Circle x402 intelligence-payment proof.

## Required deployment configuration

The Tameion server routes use the same authoritative Risk Supabase service-role configuration as the existing Risk Gate stack:

- `APP_SUPABASE_URL` + `APP_SUPABASE_SERVICE_ROLE_KEY`, or
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

The URL must resolve to the authoritative Risk Supabase project enforced by `risk-supabase.server.ts`.

Apply migration `980_tameion_agent_workflow.sql` before using the Tameion decision API.

No new wallet private key, seed phrase, RPC secret or payment signing secret is required for Tameion Agent Mode.

## Acceptance checks

The workflow is submission-ready only when all of these are true:

- Tameion policy/unit tests pass;
- application build passes and generated route tree is committed;
- database migration applies cleanly;
- `/api/tameion/decision` returns a persisted decision against canonical risk data;
- escalated path requires a valid exact-message wallet signature;
- blocked path exposes no payment button;
- one real Arc Testnet native-USDC payment is verified end to end and visible on Arc explorer;
- existing Circle x402 `/api/agent/risk` behavior remains passing and preserves `execution_authorized=false`.
