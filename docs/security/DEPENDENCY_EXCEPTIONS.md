# Dependency security exceptions

Geomacro runs a **zero-known-advisory** dependency security gate. Temporary advisory bypasses are not permitted.

## Closed — GHSA-848j-6mx2-7j84 (`elliptic@6.6.1`)

- **Removed:** 2026-10-15
- **Original risk:** Ethers v5 `@ethersproject/signing-key` depended on unpatched `elliptic@6.6.1`, vulnerable to incorrect ECDSA nonce length computation. The upstream package still has no published patched version.
- **Original transitive roots:** `@circle-fin/adapter-ethers-v6` and `@circle-fin/app-kit`.
- **Permanent remediation:** Both unused direct packages and their 86 newly orphaned locked transitive entries were removed, including `@ethersproject/signing-key` and `elliptic`. The standalone `@circle-fin/x402-batching` and canonical x402 payment code remain intact.
- **Evidence:** root dependency manifests, `bun.lock` graph pruning, zero-advisory `bun audit` security gate, full Product CI, CodeQL and no-funds x402 acceptance before any protected merge.
- **Advisory:** https://github.com/advisories/GHSA-848j-6mx2-7j84

The previous exception expired on 2026-10-12. It must **not** be extended, reintroduced through an override, or bypassed via a synthetic audit result. If the package is ever needed again, re-review the actual upstream dependency graph and security advisory first.

The canonical dependency lock remains `bun.lock` (Bun 1.4.2); pinned `toml` and `stream-json` security overrides, cryptographic signing boundaries, offline tests, and production payment freezes remain unchanged.
