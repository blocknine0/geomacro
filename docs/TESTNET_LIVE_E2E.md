# Testnet live E2E

The reusable live smoke covers the hosted Testnet access page and unauthenticated fail-closed API boundaries without requiring a wallet or moving funds.

Run:

```bash
node scripts/test-live-testnet-api-smoke.mjs
```

The complete payment E2E remains a real-wallet test:

1. connect one EVM wallet and request the one-time EIP-4361 sign-in challenge;
2. sign the domain/URI/version/chain/nonce/timestamp-bound message; an already-known wallet must resume the existing Testnet account, while a new wallet creates one account only;
3. confirm the secure tester session is active and the account has an active metered entitlement;
4. create Testnet API Key + API Secret and copy the secret once;
5. verify the Key + Secret against `/api/testnet/account` and use them on the canonical `/api/testnet/intelligence` endpoint;
6. call an eligible Testnet intelligence capability with no payment proof and confirm the exact HTTP 402 quote and exact-request fingerprint;
7. pay exactly the quoted Testnet USDC from the verified wallet on a supported Testnet payment chain;
8. preserve the submitted transaction hash before receipt/API follow-up, then retry the exact same request_id and payload with that proof;
9. confirm the premium machine-readable intelligence response is delivered and credits decrement exactly once;
10. deliberately reload/timeout after submission and confirm recovery reuses the same transaction proof without opening a second wallet transfer;
11. verify the returned signed Geomacro Risk Object cryptographically when the capability includes one;
12. replay the same request/payment and confirm there is no double charge or second credit consumption;
13. attempt the same request_id with a changed payload and confirm exact-request binding rejects it;
14. test wrong wallet, wrong chain/token/recipient, underpayment, stale/replayed proof, concurrent clicks/retries and invalid API responses.

Preserve evidence for each real run: request_id, request fingerprint, key_id (never API Secret), wallet address, sign-in chain, payment chain, transaction hash, Testnet USDC amount, capability, credit cost, credits before/after, response status, verification result, duplicate-charge count and timestamps.

Acceptance requires zero duplicate wallet accounts for repeated sign-in with the same verified wallet and zero duplicate Testnet USDC charges during retry/reload recovery.

Testnet USDC is non-revenue and the API never authorizes downstream execution.
