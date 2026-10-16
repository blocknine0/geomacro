# Geomacro Automated Commercial GRO — reviewer-free, dual-authority v1

## What changes

The old private research profile `GEOMACRO_AUTOMATED_RESEARCH_UNVERIFIED_V1` stays research-only. A new **separate private commercial qualification** at `src/lib/geomacro-machine-commercial-qualification.server.ts` supports the founder-approved **Geomacro automated cross-source verification** model. It does **not** claim approval from an independent external reviewer, Federico, or source publisher.

For one single existing canonical country risk event, `createGeomacroMachineCommercialQualifier` verifies all of:

1. An exact canonical event snapshot SHA-256 and one country/category/event id.
2. Two to four independently authored first-party publisher source IDs, article HTML SHA-256, native publication times, exact WHO/WHAT/WHERE/WHEN claim and derived scoring event timestamps.
3. A freshly sealed `geomacro.automated-commercial-proof.v1` with explicit real same-event semantic verification, source independence, counterevidence screening and zero unresolved contradictions/retractions.
4. **Two distinct Ed25519 signatures on the same exact canonical proof**: Geomacro internal machine-facts auditor and internal rights policy authority. Their public keys and SHA-256 SPKI fingerprints must be preapproved in protected environment, and the keys must differ from each other **and** the GRO signing key.
5. Each original's **exact article-scoped legal rights decision** signed by rights policy: pinned source/issuer/body SHA, separately archived licence-scope SHA and permission-record SHA, derived-only use, no raw distribution, no attribution requirement and explicit bounded validity.
6. The already-existing **real HTTPS original-byte/native-clock readback** and **current quota-reserved B2 rights registry compatibility**. No registry label alone can replace article-scoped permission.

Without **every** check, the qualifier returns null, the commercial scorer does not sign, and no paid entitlement is available.

## Production authority provisioning (not yet performed)

Use separate, independently provisioned trusted private keys in the audit and legal-policy processes. The production qualification runtime only needs their **public** PEM and verified SHA-256 of the binary SPKI DER:

- `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM`
- `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256`
- `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM`
- `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256`

These are not the external `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_*` controls and must not be the GRO signer's public key. Both private attestation keys remain on their respective trusted source-fact and legal-rights policy issuers; they do not enter the public API or GitHub logs. The existing pinned `RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64` must be present so one key cannot be used to impersonate multiple authorities.

The real fact-auditor must issue the exact source-linked semantic, contradiction and retraction decisions based on **actual original issuer content**. The rights-policy issuer must independently verify **lawful commercial reuse for the exact original pages**, derive licence terms, archive proof and approve article-level use. This is an internal commercial policy authority, not an external independent editorial reviewer. Test fixtures with generated local Ed25519 keys **are synthetic and not legal permissions**.

## How to run

The actual production input is private server memory only. Use `prepareGeomacroMachineCommercialGRO(input, {candidates,envelope}, trustedDependencies)` where `input.events` is one fully canonical, genuinely `CONFIRMED` event, `envelope` is signed by the two pinned authorities and the candidates are private first-party original pages. No public client may supply this envelope, source list or verification keys.

On successful acceptance the existing `scoreAndSignQualifiedOnDemandCountry` reuses the canonical scorer, eligibility rules, production Ed25519 signing and signature replay in **CANONICAL** profile. Output is a private prepared artifact:
`payment_authorized=false`, `persistence_performed=false`, `external_partner_approved=false`, `live_review_authorized=false`.

**This PR does not wire the public x402 route, charge USDC, B2 PUT, D1 hot promotion or change Federico's external-review contract.** Payment and publication require separately verified full production authorization. No Supabase or paid new infra is introduced.

## Acceptance and missing dependencies

Run `npx vitest run src/lib/geomacro-machine-commercial-qualification.server.test.ts src/lib/geomacro-machine-research-gro.server.test.ts src/lib/geomacro-machine-source-rights.server.test.ts src/lib/on-demand-qualified-country-risk.server.test.ts`.

The tests prove both a valid **synthetic** dual-authority private GRO and fail-closed negative cases (missing/incorrect keys, claims, article bytes, times, legal permissions and source-registry). **CI does not prove genuine live licensing**. Before customer activation:

- Configure independently preapproved production fact-auditor and rights policy public keys; produce current real, distinct first-party native pages and independently audited internal machine claim receipts.
- Obtain actual article-specific derived-commercial licences/permissions. No automatic equivalence between B2 registry status and legal permission.
- Execute protected real-data no-funds GRO signature/readback, then independently verify B2/D1 current snapshot, HTTP deep health and precise deployed SHA.
- Complete separate x402 no-funds acceptance and explicit real-money authorization; do not turn any research flag true as a shortcut.

The old `FEDERICO_STRICT` independent-review contract remains unchanged. Synthetic/single-source/stale/denied original evidence cannot be presented as commercially ready.
