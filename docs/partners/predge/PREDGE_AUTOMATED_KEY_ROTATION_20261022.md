# Predge key-rotation automation — 22 October 2026

Purpose: public research-market signature verification only. Does NOT grant commercial rights, enable Risk Gate, produce GROs or authorize payments.

## Future rotation

1. Independently authenticate the new full 64-hex Ed25519 public key with Predge. Never use only its 16-hex kid.
2. Change ONLY `PREDGE_ATTESTATION_PUBLIC_KEY` in `scripts/ops/verify-predge-signed-market.mjs`. `PREDGE_ATTESTATION_KID` derives automatically.
3. Open PR; offline tamper/key lifecycle tests and live three-signature verifier run automatically.
4. After merge, `main` push for that same file triggers the workflow. Scheduled no-secret verification runs four times/day; `workflow_dispatch` also works.
5. Upstream must re-sign public market 5710779 under the new key. If not re-signed, CI FAILS CLOSED and retries on schedule. It never accepts the registry alone as market verification.

Locally:
```bash
node --test scripts/ops/verify-predge-signed-market.test.mjs scripts/ops/verify-predge-key-rotation.test.mjs
node scripts/ops/verify-predge-key-rotation.mjs
```

Fixed read-only allowlisted public endpoints: Predge key registry and settlement-risk market 5710779. No Bearer tokens, secrets, x402 calls, writes, Supabase, B2 or D1.

Limit: if Predge stops publishing or re-signing market 5710779, changing only the key cannot restore a cryptographic proof. An authenticated new sample endpoint or renewed upstream record is then required. All failures remain non-authorizing.

Observed baseline: PR #2691 job 119884098567 succeeded on 22 Oct 2026, 6/6 offline tests, new kid `3b6551a6439b9bda`, revoked old kid `13fa3d18a369e6c7`, and three valid live signatures.
