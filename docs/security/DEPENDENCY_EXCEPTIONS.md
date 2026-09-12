# Dependency security exceptions

Geomacro treats dependency advisories as release-gating findings. Exceptions are temporary, explicit, and fail closed when their scope or expiry changes.

## GHSA-848j-6mx2-7j84: elliptic 6.6.1

- Severity: Low
- Package: `elliptic@6.6.1`
- Status: upstream patch unavailable as of 2026-09-12
- Review expiry: 2026-10-12
- Current paths:
  - `@circle-fin/adapter-ethers-v6 > @ethersproject/abi > ... > @ethersproject/signing-key > elliptic`
  - `@circle-fin/app-kit > @ethersproject/abi > ... > @ethersproject/signing-key > elliptic`
- Advisory: https://github.com/advisories/GHSA-848j-6mx2-7j84

The current Circle packages still depend on the affected Ethers v5 transitive chain, and the advisory has no published patched `elliptic` version. Geomacro will not replace a cryptographic dependency with an unreviewed fork only to make an alert disappear.

Compensating controls:

1. The Security Resilience Gate permits exactly this one low advisory and rejects every other dependency advisory.
2. The exception automatically expires on 2026-10-12, forcing re-review.
3. `bun.lock` is the only committed dependency lockfile and is installed with `--frozen-lockfile` in CI.
4. `toml` and `stream-json` are pinned to patched transitive versions through validated Bun overrides.
5. Product build, Risk Gate fail-closed tests, database migration safety, and deterministic stress testing remain release gates.

Remove this exception immediately when Circle or the affected upstream dependency chain publishes and validates a patched path.
