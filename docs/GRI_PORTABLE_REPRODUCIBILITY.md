# GRI Portable Reproducibility Proof

Status: buyer/integration-grade reproducibility surface for `gri-v1.2.0` / `gri-proof-v1.2.0`.

## Objective

A third-party engineer should be able to take a structured Geomacro proof bundle and independently verify, without database access, model access, API keys, or private warehouse access, that:

1. the current score reconciles to its exact event contributions;
2. category contributions reconcile to the same score;
3. current methodology, input, evidence, calculation and source-disposition manifests reproduce their stored hashes;
4. the exact change from the previous snapshot reconciles to event-level and category-level deltas;
5. the deterministic explanation matches the mathematical attribution;
6. the proof hash reproduces from the canonical proof payload; and
7. the complete portable bundle has not changed since its bundle hash was produced.

The bundle is structured-only. It does not provide raw/private warehouse payloads.

## Bundle version

`gri-portable-proof-v1.0.0`

The current GRI contract remains:

- methodology: `gri-v1.2.0`
- proof: `gri-proof-v1.2.0`

The portable format does not change the score formula. It packages existing canonical manifests and proof logic into a DB-independent verification artifact.

## What is included

The bundle contains:

- canonical methodology manifest;
- current normalized input manifest;
- current structured evidence/provenance manifest;
- current calculation manifest with category and event contribution weights;
- complete current source-disposition ledger;
- previous calculation/evidence manifest when a change attribution exists;
- exact deterministic change attribution;
- the existing GRI v1.2 proof envelope and hashes;
- a portable bundle hash.

No raw provider payload or private historical warehouse access is included.

## Mathematical checks

The verifier independently checks:

```text
sum(current event contribution points) = current raw GRI
sum(current category contribution points) = current raw GRI
sum(event delta contribution points) = current raw GRI - previous raw GRI
sum(category delta contribution points) = current raw GRI - previous raw GRI
```

The accepted numerical residual is the existing GRI reconciliation tolerance.

The verifier also reconstructs the expected change attribution from the bundled previous/current calculations and evidence references. A changed event contribution, score, category weight, attribution row, disposition row, explanation, or proof field therefore breaks one or more deterministic checks.

## Hash checks

The verifier recomputes:

- methodology hash;
- input hash;
- evidence hash;
- calculation hash;
- source-disposition hash;
- change hash;
- proof hash;
- portable bundle hash.

These use the same canonical JSON and SHA-256 contracts as the production GRI v1.2 proof engine.

## Reproducibility vs authenticity

This distinction is intentional and important.

A self-contained bundle can prove **internal reproducibility and integrity**, but hashes alone do not prove that a bundle was issued by Geomacro. A third party should therefore obtain the published `proofHash` independently from a trusted Geomacro publication/API and pass it to the verifier.

When an expected trusted proof hash is provided, the verifier reports whether the internally reproduced proof hash matches that independent anchor.

Until the GRI proof envelope itself receives a separate issuer-signature/attestation contract, Geomacro must not describe a portable hash-only bundle as cryptographically proving issuer authenticity.

## Offline verifier

From the repository:

```bash
node scripts/verify-gri-proof-bundle.mjs bundle.json <trusted-proof-hash>
```

or:

```bash
cat bundle.json | node scripts/verify-gri-proof-bundle.mjs - <trusted-proof-hash>
```

The command has no network, database, secret, or model dependency.

Without the optional trusted proof hash, a successful result means the bundle is internally reproducible. The result explicitly reports that authenticity is not independently anchored.

## Output semantics

Important fields:

- `valid`: all internal checks pass, and the trusted proof hash matches when one was supplied;
- `internallyReproducible`: score, attribution, manifests, hashes, proof and bundle all reconcile;
- `authenticityAnchored`: the caller supplied an independent expected proof hash;
- `authenticAgainstExpectedHash`: reproduced proof hash equals that expected hash;
- `checks`: individual deterministic verification results;
- `recomputed`: recomputed hashes and numerical residuals;
- `reasonCodes`: deterministic mismatch reasons.

## Security and commercial boundary

- raw data is not part of the bundle;
- the proof verifier is read-only;
- no customer execution is authorized;
- no transaction is signed or submitted;
- structural historical evidence remains outside GRI v1.2 weighting unless a future methodology explicitly versions that change;
- a successful proof is evidence of reproducibility, not a third-party audit/certification claim.
