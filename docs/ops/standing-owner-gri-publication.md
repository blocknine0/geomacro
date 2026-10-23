# Standing owner authorization for reviewed GRI publication

The existing genuinely Pallab/Suman-signed
`geomacro.gri-automated-policy-delegation.v1` explicitly permits
`policy_bound_owner_publication_approval`. Previously it was enrolled but the
production admission script still required a new Pallab signature on each
batch. The conditional owner path now connects that permission to both the
existing signed-ready backstop and canonical reviewed-GRI publisher.

There is no new consent or signing-key setup. These protected workflows
explicitly enable `GEOMACRO_GRI_STANDING_OWNER_ADMISSION=VERIFIED_INPUTS_ONLY`.
They validate the actual two signed consents, the approved human and machine
public identities, separate Facts/Rights/GRO pins, canonical main and
revocation before admitting an input for verification. No human or machine
private key is needed by the owner admission gate.

This is conditional owner authorization, **not** a new Suman signature on
the GRI or country certificates. The reviewed publisher still requires the
real independently signed current GRI input, each signed country/category
certificate, exact original evidence and rights review, native clocks,
canonical scoring, new original after the historical anchor, immutable B2
history/readback and D1 acceptance. None of those validators is replaced by
the policy or by pointer-shaped metadata. The standing owner's conditional
authorization becomes effective for publication only when that unchanged
pipeline accepts all checks. No x402 payment is authorized.

The existing 28-minute signed-ready hint and cross-main retry/deduplication
remain in force. No real input means no dispatch, B2 request or publication.
An explicitly supplied batch owner envelope is checked on its existing path;
an invalid or expired envelope is never silently replaced with standing
consent. Revocation blocks the standing path. The original human-batch path
remains available without enrollment.

The existing immutable private staging operator also accepts this explicit
alternative mode, with the same approved public policy/identity environment
and actual signed GRI, certificate and historical B2 file pins:

```bash
bun scripts/ops/stage-approved-reviewed-gri-private-b2.mjs \
  --stage-approved-review-with-standing-owner-no-funds
```

Set `GEOMACRO_GRI_STANDING_OWNER_ADMISSION=VERIFIED_INPUTS_ONLY` and use the
existing genuine signed consent in `GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64`,
approved public identity environment and enrollment/revocation state. Supply
no `GEOMACRO_OWNER_SIGNED_APPROVAL_PATH` in this mode. The original human
staging command remains unchanged. This alternative still checks actual
reviewer signatures, country certificates, source rights, canonical scoring
and historical bytes before creating its B2 client. With the existing
`GRI_SIGNED_READY_DISPATCH_ACK=YES_NO_FUNDS`, exact immutable input readback
hands off to the protected publisher automatically; that publisher checks
the **current protected** consent and revocation again before its B2 GET.

The hosted handoff distinguishes a verified standing owner policy from an
actual per-batch owner signature, independent numerical review and signed
3/3 delivery. A successful consent/admission job is not deep-health 200.

To advance the remaining genuine-data stage, the approved custodians must
complete source Facts/Rights evidence, and the independent reviewer must
supply actual current GRI and certificate bytes through the existing private
staging workflow. The owner does not need to sign those bytes again when
the protected standing path is used. Automated independent numerical-review
and source-rights issuance are separate integrations and are not claimed by
this change. Keep current failures visible until real inputs are supplied.
