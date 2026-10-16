# First genuine no-attribution machine commercial GRO: strict launch runbook

## Founder locks (17 Oct 2026)
No attribution-required sources. No Supabase, paid API, x402 charges, private key upload, synthetic event/rights, invented issuer signatures or refreshed old original clocks.

## 0. Audit the EXISTING facts and rights signing keys
Machine public SPKI PEM/SHA pin validation is already proven by the protected
`machine-commercial-gro-no-funds.yml` preflight; this does not prove the
corresponding private signing keys are available.

The read-only `machine-private-key-location-audit.yml` tests two isolated
protected production jobs. Each job reads ONE possible issuer private key
from an existing GitHub production environment secret, derives its public
Ed25519 SPKI locally in memory, checks the installed public PEM/SHA pin, and
checks it is not the GRO signer. It creates NO signature or B2/D1 writes.

Potential optional GitHub protected secrets:
- `GEOMACRO_MACHINE_FACTS_PRIVATE_KEY_PKCS8_B64` (facts job only)
- `GEOMACRO_MACHINE_RIGHTS_PRIVATE_KEY_PKCS8_B64` (rights job only)

A `NOT_AVAILABLE_IN_THIS_ENVIRONMENT` result proves nothing about keys on
the user's workstation, other secret managers, or separately held issuer
processes. Never rotate/reissue keys based on a missing GitHub secret alone.
`PRIVATE_KEY_OR_PIN_INVALID` is a hard stop. `PINNED_PRIVATE_KEY_MATCH`
proves matched local possession, not authorization to attest evidence.
Do not move private keys between the two different issuer processes, use
GitHub Actions artifacts for key transport, or paste keys into chat.

## 1. Real current original-source selection
Use existing
`discoverOnDemandForPrivateQualification`,
`verifyOnDemandOriginalArticlePages` and
`verifyGeomacroTwoOriginalMachineBinding` for ONE country/category event.
Require independent first-party authoring, exact same WHO/WHAT/WHERE/WHEN,
2-4 different publisher organizations, actual article HTML byte SHA-256,
publisher native publication clocks, evidence that the exact country and
category are relevant, and real counterevidence/retraction decisions.
A GDELT index, syndicated link, official landing-page modification date or
two different issuer events is NEVER the missing second original.

One real lead observed: Federal Reserve Board, 16 October 2026,
"termination of enforcement actions with Gardner Bancshares, Inc. and
Small Business Bank", published on the Board's own press-release page.
That is one first-party USA/macro original candidate only; no independently
authored SAME-EVENT second issuer, HTML SHA readback, specific permission
or machine attestation has yet been verified. It must NOT be promoted
as commercially eligible.

## 2. Separate per-article no-attribution rights
Current `src/lib/geomacro-machine-source-rights.server.ts` requires each
first-party issuer's B2 certified source registry rights row AND the facts/
rights signed proof's own article bytes identity and article-specific
permission record. Require `licensed_derived_use:true`,
`raw_redistribution_allowed:false` and
`attribution_required:false` for EVERY selected original.
An open licence requiring attribution is INELIGIBLE under the founder's
locked policy; do not add customer attribution UI or quietly loosen the
rights gate. Source registry status alone never proves article scope.
Federal-government copyright notices, embedded third-party material,
publisher seals and trademark usage must be checked in the actual scope.

## 3. Actual distinct Ed25519 attestation and private GRO signing
The trusted facts process alone signs a substantiated canonical
`geomacro.automated-commercial-proof.v1` with verified same-event claim,
source independence and counterevidence decisions. The distinct rights
process separately signs EXACTLY that canonical proof after confirming every
article-specific legal permission. Neither may self-assert the other's role.
The third canonical GRO signer stays independent.

The protected operator takes the genuine independent signatures + existing
canonical CONFIRMED event in a 0600 JSON file OUTSIDE the repo and produces a
no-funds private GRO:

```bash
bun scripts/ops/accept-private-geomacro-machine-commercial-gro.ts \
  --input=/secure/geomacro-private/current-machine-commercial.json \
  --out=/secure/geomacro-private/private-machine-commercial-gro.json
```

Success `MACHINE_COMMERCIAL_SIGNED_PRIVATE_NO_FUNDS` is NOT a
production signed Intelligence hot snapshot.

## 4. Verify existing publisher trust boundaries before publication
The current `intelligence-supabase-free-reviewed-current.yml` requires
separately external-reviewer-signed eventPackages; a machine-signed GRO
cannot be deceptively submitted as that contract. The first genuine event
therefore still needs an audited, equivalent but distinctly labelled
machine-authority Intelligence publisher bridge. It must preserve original
clock expiration, three-category source requirements, B2 exact-gzip
readbacks, D1 admission and no raw upstream content.

Current GRI v1.2 needs independently qualifying reviewed three-category
input, historically pinned B2 baseline and signed country-category
certifications, not merely one valid GRO. Risk Indices may only follow an
independently current, verified D1 GRI parent. x402 stays prelaunch while
HTTP deep health is 503 or any requested product lacks actual entitlement.

Existing workflows and guards:
- `machine-commercial-gro-no-funds.yml`
- `intelligence-supabase-free-reviewed-current.yml`
- `gri-v12-supabase-free-reviewed-current.yml`
- `risk-indices-verified-d1-parent.yml`
- `scripts/ops/recover-gri-pinned-b2-version.mjs`

## Honest progression
1. Read-only facts/rights key-location result separately per issuer
2. TWO actual first-party original byte readbacks for ONE same-event claim
3. Per-article no-attribution commercial rights records VERIFIED
4. TWO real independent facts/rights signatures VERIFIED on identical proof
5. Existing third canonical GRO signature and private local replay VERIFIED
6. Independently verified machine-authority Intelligence publication bridge
7. GRI historical anchor + three-domain GRI + Risk Indices current B2/D1
8. Exact published SHA, HTTP deep-health 200 and x402 no-funds acceptance

Never collapse steps 1-5 into a fake green CI result or invent current
coverage across all 195 countries x 3 domains.
