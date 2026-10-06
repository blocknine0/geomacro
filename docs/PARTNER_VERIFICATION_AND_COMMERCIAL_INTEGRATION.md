# Geomacro Partner Verification and Commercial Integration

This document defines the path from technical interoperability to a production commercial relationship for external reviewers, verifiers, agents and risk platforms.

## 1. Technical trust model

Geomacro Risk Objects are signed, independently verifiable artifacts. A partner must not trust issuer-provided status fields by themselves. The receiver verifies the exact record bytes, canonical payload hash, Ed25519 signature, key lifecycle, schema, subject, methodology, freshness and partner-specific provenance policy before admitting the object.

Public trust and verification surfaces:

- `GET /.well-known/geomacro-risk-keys.json`
- `GET /.well-known/jwks.json`
- `GET /api/risk-object-keys`
- `POST /api/risk-object-keys` with a complete signed Risk Object
- `GET /.well-known/geomacro-partner-verification.json`

The receiver owns the final admission decision and should pin approved key fingerprints out of band for production use.

## 2. Federico strict profile

The `federico-strict-evidence-v1` profile is a bounded partner evaluation profile. It is fail-closed and requires multiple independent source families. The profile is country-agnostic: the same cryptographic, provenance, independence, freshness, commercial-eligibility, tamper and receiver-verification rules apply to every enabled uppercase ISO3 country. A country with insufficient current evidence remains `UNREADY`/`NO_PUBLICATION`; no country-specific threshold is weakened to force availability. The deterministic positive-control fixture proves the gate can open for a known-good vector without weakening the live evidence gate.

The positive control is synthetic and must never be treated as production evidence.

## 3. Partner review proof lifecycle

For a fresh signed object, Geomacro can create an interoperability review request that binds the exact Risk Object as external evidence using SHA-256. The preflight validates the original artifact, rejects a tampered vector, checks freshness, verifies public trust metadata and submits the exact record to the configured external review service when authorized credentials are present.

A returned signed proof is accepted only after verification against both the primary proof verifier and an independent verifier node. Partner verdicts and proofs do not authorize an irreversible action. They are evidence for a receiver-controlled admission process.

## 4. Commercial progression

The intended progression is:

1. Technical evaluation with deterministic positive control and live fail-closed runs.
2. External verifier or ledger integration using exact signed Risk Objects.
3. Limited production pilot with explicit subject/profile scope and agreed usage limits.
4. Commercial API or event delivery agreement with pricing, support expectations, retention, redistribution rights and incident procedures.
5. Optional broader federation, ledger publication or automated machine-to-machine consumption after both parties approve the operating model.

Technical success does not imply a commercial agreement. Production commercial use requires an explicit contract.

## 5. Commercial controls

A production partner agreement should define at minimum:

- permitted Risk Object profiles and subjects
- request or delivery limits
- pricing and settlement rail, including x402 when agreed
- SLA and support channel
- key rotation and revocation handling
- proof retention period
- permitted derived-data use and redistribution restrictions
- confidentiality and disclosure rules
- incident notification and recovery procedure
- termination and key/offboarding procedure

Raw third-party source material must not be redistributed unless separately licensed. The default partner surface is derived intelligence plus verifiable provenance metadata.

## 6. Operational acceptance gate

Before a partner pilot is marked production-ready, all of the following must pass:

- deterministic positive control
- live fail-closed behavior when evidence is insufficient
- exact-record tamper rejection
- public trust-registry verification
- independent signature verification
- partner proof verification when a proof provider is configured
- Product CI
- security scanning
- commercial launch readiness
- x402 prelaunch safety when paid delivery is enabled

The machine-readable discovery document and `scripts/check-partner-commercial-readiness.mjs` encode the minimum repository-level contract.

## 7. Federico / invinoveritas handoff

When a fresh `FEDERICO_STRICT` object successfully publishes, run the existing interoperability preflight with the exact persisted signed payload. If the partner returns a signed proof, retain only the minimum required proof metadata in public CI summaries. Do not expose API keys, raw private source material or unrestricted partner response payloads.

Federico's offered edge-vector verifier can be added as a second reference implementation in the dedicated positive-control CI. The Geomacro reference implementation remains independent so either implementation can detect divergence in the other.


## 8. Repeatability and repeated external testing

Federico or another receiver may verify the public contract and signed objects repeatedly. Repeatability has a precise meaning:

- the same immutable signed GRO must always produce the same canonical record hash and the same signature-verification result;
- the deterministic strict positive-control vector must produce the same result on repeated executions;
- public partner-discovery and active trust-registry projections must not drift within a verification probe;
- a newly generated GRO may legitimately differ because fresh evidence and trusted time have changed;
- an expired, stale, tampered or insufficiently corroborated object must fail closed rather than being forced into a successful admission result.

The `Federico Repeatability Gate` runs without partner credentials, user funds or Federico allowance consumption. It is scheduled at a staggered six-hour cadence and can also be run manually. Live `/review` calls remain explicitly authorized only and are never scheduled.
