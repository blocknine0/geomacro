# Issue #2044 — independent reviewer operational acceptance

Passing fixture tests does not establish actual legally permitted commercial use.
A test receipt, one original issuer, or hash-only candidate remains unapproved.

## Separate reviewer from commercial signer

The manual private first-live acceptance command requires the following environment
variables, set by the authorized operator, never committed or sent in chat:

- `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM`
- `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256` — lowercase SHA-256 of
  the reviewed canonical DER/SPKI public key; approve out of band
- Existing GRO public/private key environment variables

Before any source-rights read, GRO signing or output write, the command
checks both parsed keys are Ed25519, checks the reviewer fingerprint with
constant-time equality and rejects reviewer/GRO key reuse. Public-key
fingerprints alone never establish authorized human/trusted reviewer identity.
Do not put reviewer private keys, source articles or source-specific rights
receipts into the repository, GitHub Action logs, artifacts or public D1.

## Real production close-out criteria

1. Approve an independent reviewer role and its public key fingerprint
   outside the runtime that signs GROs.
2. Verify two distinct independently authored original issuers make the
   exact same structured event claim, with native publication clocks and
   actual reviewed original evidence, not syndicated copies.
3. Screen counterevidence/retractions, check per-original rights and an
   independently read-back current B2 rights registry for both source IDs.
4. Obtain the actual authorized reviewer's Ed25519-signed package binding
   the derived customer row, original hashes and exact scoring event hash.
5. Run protected manual-only signed GRO acceptance and verify the signed
   result independently. Rejected, stale, spoofed, rights-denied and
   orphan evidence must remain unapproved.
6. Do not promote to public hot D1 or x402 paid delivery unless their
   separate production acceptance checks pass and founder ACK is given.

Existing code provides infrastructure only; no genuine authorized reviewer
proof, independent corroboration or source rights are manufactured by this PR.
