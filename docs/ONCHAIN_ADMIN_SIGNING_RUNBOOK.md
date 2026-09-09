# Onchain Admin Signing Runbook

Status: security control for the Arc Testnet technical-proof surface.

This runbook defines where Geomacro privileged signing is allowed. It is designed to keep rare administrative authority out of hosted build runners and to preserve separation between independent signers.

## Non-negotiable rules

1. GitHub Actions, Lovable, public CI, preview environments and browser bundles must not receive treasury, owner, liquidity or deployment private keys for rare admin operations.
2. `TREASURY_PRIVATE_KEY_1` and `TREASURY_PRIVATE_KEY_2` must never be loaded into the same hosted runner or the same ordinary automation process.
3. V2 upgrade proposal/approval and final execution are separate trust steps. Verification may be automated; signatures are produced in separate trusted signing contexts.
4. The owner, treasury, guardian and liquidity credentials must be distinct where the contract design expects distinct roles. Do not reuse staging keys in production-like infrastructure.
5. Before any signing operation, independently verify:
   - Arc Testnet chain ID `5042002`;
   - permanent V2 proxy `0x2F874FB07084a22D2bB314D0762Af57Cb1856868`;
   - candidate implementation address and deployed bytecode;
   - current treasury/owner/guardian state;
   - expected pending implementation, approval count and timelock where applicable.
6. Never paste a private key into chat, a ticket, GitHub issue, pull request, shell history, screenshot, CI log or browser console.
7. If a signing device or secret is suspected to be exposed, stop the operation and rotate/revoke the affected credential before continuing.

## Hosted CI responsibility

The GitHub workflows for V2 candidate verification, execution readiness and liquidity funding readiness are intentionally read-only. They can verify chain state and fail closed, but they cannot submit privileged transactions.

CI output is evidence, not authorization to sign.

## Upgrade sequence

### 1. Candidate verification

Run the read-only `Verify AgentArena V2 Upgrade Candidate` workflow from `main`. Confirm that it passes against the exact candidate address.

### 2. First treasury signer

In a trusted local/offline signing context, signer 1 verifies the same proxy and candidate address and submits only the proposal/first approval required by the contract.

Record the public transaction hash. Do not record the key.

### 3. Second treasury signer

Using a separate signing context, signer 2 independently verifies the proxy, candidate and transaction from signer 1 before submitting the second approval.

The second signer must not receive signer 1's private key or seed material.

### 4. Timelock verification

Run the read-only execution-readiness workflow. It must confirm:

- pending implementation equals the reviewed candidate;
- at least two approvals are registered;
- the upgrade timelock exists and has elapsed;
- Arc Testnet and the permanent proxy are correct.

### 5. Owner execution

Only after the readiness check passes, use the owner signing context to execute the already-approved upgrade. Re-check the calldata and candidate address immediately before signing.

### 6. Post-operation verification

Read back the implementation/economics/admin state and preserve the public transaction hash and verification result. Do not mark the operation complete if owner, treasury, guardian, fee state or expected upgrade bookkeeping changed unexpectedly.

## Liquidity funding

The `Verify AgentArena V2 Liquidity Funding Readiness` workflow validates the target and economics but does not fund anything. Funding is signed outside CI using the dedicated liquidity credential after the exact amount and destination are independently reviewed.

## Guardian operations

The scheduled security monitor currently retains a dedicated guardian credential because its function is emergency anomaly response. It is isolated from owner/treasury/liquidity roles and serialized under its own workflow concurrency boundary. This is a conscious residual risk and should be replaced by a stronger managed signing/HSM policy before any production-mainnet deployment.

## Evidence to preserve

For a material admin operation preserve only non-secret evidence:

- reviewed commit SHA;
- workflow/readiness result;
- chain ID and public contract addresses;
- candidate implementation address;
- public transaction hashes;
- approval count/timelock result;
- post-operation read-only verification;
- incident/remediation record if anything differed from expectation.

Never preserve seed phrases or private keys in repository artifacts.
