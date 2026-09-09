# GRI Portable Reproducibility Proof

Version: `gri-portable-proof-v1.1.0`

This package is designed for external engineering, diligence and institutional integration review of Geomacro's deterministic GRI v1.2 proof chain.

## What can be verified offline

A bundle contains structured calculation state only. It does not contain provider-private raw payloads or customer-private data.

An independent verifier can check, without database access, secrets, network calls or model calls:

- GRI methodology manifest hash
- normalized input manifest hash
- structured evidence manifest hash
- canonical calculation manifest hash
- disposition ledger hash
- exact score reconciliation from event contributions
- exact score reconciliation from category contributions
- exact previous-to-current event attribution
- exact previous-to-current category attribution
- deterministic explanation output
- change hash
- published proof hash
- bundle hash

The verifier also supports an independently obtained trusted `proofHash`. When supplied, the report distinguishes internal reproducibility from issuer authenticity anchoring.

## Why exact reproduction state is included

The published calculation manifest intentionally rounds fields for stable canonical hashing. Exact change attribution, however, originates from the full-precision deterministic calculation state.

The portable bundle therefore includes a structured `reproduction` object alongside the canonical manifests. This is computed state, not raw warehouse data. The verifier reconstructs the canonical input/evidence/calculation manifests from that exact state and rejects any mismatch.

This avoids the invalid shortcut of trying to reconstruct exact attribution from an already-rounded manifest.

## Trust boundaries

This verifier proves mathematical and cryptographic-hash consistency of the supplied GRI bundle. Hash consistency alone is not an issuer signature.

Until a separately versioned signed GRI attestation contract is introduced, third-party authenticity should be anchored using a trusted proof hash obtained independently from the bundle itself.

## Raw-data policy

Customer-facing and diligence bundles are structured-only. Raw/private warehouse payloads are never part of this package.

## CLI

```bash
node scripts/verify-gri-proof-bundle.mjs ./bundle.json
```

With an independently obtained trusted proof hash:

```bash
node scripts/verify-gri-proof-bundle.mjs ./bundle.json <trusted-proof-hash>
```

Exit code `0` means the requested verification conditions passed. Exit code `1` means verification failed. Exit code `2` means the bundle could not be read or parsed.

## Commercial relevance

This proof layer supports the Geomacro positioning as verifiable intelligence and decision infrastructure. A buyer or integration engineer can inspect the exact score construction, score-change attribution and proof chain without relying on a dashboard or a proprietary model response.