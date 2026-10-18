# Machine signed Intelligence — event-driven continuation (no funds)

The protected existing `Machine Dual-Authority Intelligence Publication` workflow accepts two exact immutable input modes:

1. Existing owner manual `workflow_dispatch` with `machine_b2_key` and `machine_b2_sha256`.
2. Newly added **issuer-triggered** `repository_dispatch` event `machine_intelligence_dual_signed_ready` with a typed `geomacro.machine-intelligence-dual-signed-ready.v1` payload.

Example for an already independently facts-and-rights-signed immutable private B2 bundle (the placeholders are **not** real grants, hashes or input files):

```json
{
  "event_type": "machine_intelligence_dual_signed_ready",
  "client_payload": {
    "schema": "geomacro.machine-intelligence-dual-signed-ready.v1",
    "machine_b2_key": "geomacro-evidence/v1/private/machine-intelligence-current/<sha256>.json",
    "machine_b2_sha256": "<sha256>"
  }
}
```

Dispatch this through GitHub's authenticated `POST /repos/blocknine0/geomacro/dispatches` from an **authorized** independent private issuer when the real fully signed bundle is already archived. A raw RSS/Telegram/GDELT source event, unsigned source candidate or a successful free Finds job **must never** dispatch a commercial signed publication event. An event payload is not proof that contents are licensed or fresh.

## Mandatory downstream no-funds checks

- Protected `main` SHA, production environment and explicit immutable 64-hex B2 key + identical SHA.
- Production separately approved Facts/ Rights Ed25519 verification identities and existing GRO public identity separation, plus full signed event/rights/source authenticity.
- Existing B2 account-wide D1 quota governor, per-run 4 input attempts + 8 publish attempts, exact byte hash/readback and direct public D1 readback.
- Current real first-party originals, exact event/rights signature binding and the existing **three-category** commercial product contract. Owner's Geomacro-derived-output licence does not grant any third-party article rights.
- Supabase frozen, real USDC payment disabled. No bypass of existing GRI/Risk Indices reviewer/certificate requirements.

This event-driven transport removes a **manual-dispatch operational dependency only**. It does not fabricate the independent issuer signatures, original article permissions, GRI v1.2 numerical score or a false green HTTP 200. If any material prerequisite is unavailable, the existing publisher fails closed. Real production acceptance still requires a genuine current input, pinned historical B2, actual B2/D1 promotion and outside-in verification.
