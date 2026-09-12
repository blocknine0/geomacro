# Testnet live E2E

The reusable live smoke covers the hosted Testnet access page and unauthenticated fail-closed API boundaries without requiring a wallet or moving funds.

Run:

```bash
node scripts/test-live-testnet-api-smoke.mjs
```

The complete payment E2E remains a real-wallet test:

1. create tester profile;
2. verify an EVM wallet by message signature;
3. create Testnet API Key + API Secret;
4. call an eligible Testnet intelligence capability with no payment proof and confirm HTTP 402 exact quote;
5. pay exactly the quoted Testnet USDC from the verified wallet on a supported Testnet chain;
6. retry the same request_id with transaction proof;
7. confirm the premium machine-readable response is delivered and credits decrement exactly once;
8. verify the returned signed Geomacro Risk Object cryptographically when the capability includes one;
9. replay the same request/payment and confirm there is no double charge or second credit consumption;
10. test wrong wallet, wrong chain/token/recipient, underpayment, stale/replayed proof and timeout/retry behavior.

Preserve evidence for each real run: request_id, key_id (never API Secret), wallet address, chain, transaction hash, Testnet USDC amount, capability, credit cost, credits before/after, response status, verification result and timestamps.

Testnet USDC is non-revenue and the API never authorizes downstream execution.
