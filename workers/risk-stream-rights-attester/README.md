# Risk Stream commercial-rights attester

This is a separate, private Worker deployment for the commercial-rights proof.
It exposes only `POST /v1/attest`; configure it for internal service-to-service
access. `workers_dev` and preview URLs are disabled and no public route is
configured. The private caller is the control-plane Worker through its
`RISK_STREAM_RIGHTS_ATTESTER` service binding. It sends `Authorization: Bearer …`
using this Worker's `RIGHTS_ATTESTER_BEARER_TOKEN` secret. Store the same
invocation token separately in the control-plane Worker as
`RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN`. The Node emitter calls the
root-admin-protected control-plane bridge at
`POST /v1/internal/risk-stream/attest`; it does not contact this Worker over a
public URL. The signing secret is
`RIGHTS_ATTESTER_PKCS8_B64`. The Worker refuses signing when that key or the
source-registry binding is missing. It issues only a parameterized `SELECT`
against `risk_stream_sources` and never mutates the registry. It does not log
request bodies, original text, credentials, or signing material.

The Wrangler D1 binding is named `SOURCE_REGISTRY_READONLY` and the code path
uses it only for reads. Wrangler's D1 binding configuration does not provide a
per-binding read-only ACL, so the deployment's database permissions must also
be restricted by the owner where the provider supports that control. Do not
deploy until the binding points at the production registry and the database
credentials/access policy have been reviewed.

Before signing, the Worker requires an exact registry row with `enabled=1`,
`commercial_rights_approved=1`, future `rights_expire_at`, and source ID,
publisher root domain, parent media entity, and role matching the candidate.
A signature here is the owner's own attestation, produced only after those
checks. It records the owner's registry-backed rights review; the signature
does not itself create a licence or substitute for documentary review.

## Separate key issuance

Run these commands on the rights operator's separate secured machine. Keep the
private PEM there and never put it in Git, a ticket, or a log. Do not reuse the
facts attester's key:

```sh
umask 077
openssl genpkey -algorithm ED25519 -out /secure/rights.ed25519.private.pem
openssl pkey -in /secure/rights.ed25519.private.pem -pubout -outform DER | base64 | tr -d '\r\n' > /secure/rights.spki.b64
openssl pkcs8 -topk8 -nocrypt -in /secure/rights.ed25519.private.pem -outform DER | base64 | tr -d '\r\n' > /secure/rights.pkcs8.b64
```

Install the PKCS8 value only as this Worker's `RIGHTS_ATTESTER_PKCS8_B64`
secret, and provision an independent bearer secret as
`RIGHTS_ATTESTER_BEARER_TOKEN`. Copy that invocation token only into the
control-plane `RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN` secret. Configure the control plane's
`RISK_STREAM_MACHINE_RIGHTS_SPKI_B64` with the matching PUBLIC SPKI value from
`rights.spki.b64`. Do not install the private PEM or PKCS8 value in the control
plane. Keep this Worker's key and deployment separate from the facts attester.

See [the genuine-original operator guide](../../docs/risk-stream-genuine-originals-operator.md)
for the signed message format. The shared claims serializer is imported from
the control-plane pipeline so the signed message stays byte-for-byte aligned.
