# Risk Stream facts attester

This is a separate, private Worker deployment for the facts proof. It exposes
only `POST /v1/attest`; configure it for internal service-to-service access.
`workers_dev` and preview URLs are disabled and no public route is configured.
The private caller is the control-plane Worker through its
`RISK_STREAM_FACTS_ATTESTER` service binding. It sends `Authorization: Bearer …`
using this Worker's `FACTS_ATTESTER_BEARER_TOKEN` secret. Store the same
invocation token separately in the control-plane Worker as
`RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN`. The Node emitter calls the
root-admin-protected control-plane bridge at
`POST /v1/internal/risk-stream/attest`; it does not contact this Worker over a
public URL. The signing secret is
`FACTS_ATTESTER_PKCS8_B64`. The Worker refuses signing when that key is missing
or malformed. It does not log request bodies, original text, credentials, or
signing material.

Before signing it checks the candidate shape, exact source-page SHA-256, the
72-hour publication window, HTTPS publisher-domain binding, entity and derived
field constraints, and the event fingerprint against the control-plane
identity formula. A signature here is the owner's own attestation, produced
only after those checks. These mechanical checks establish payload integrity
and consistency; the owner remains responsible for independently confirming
that the submitted bytes are a genuine first-party original before authorizing
this attestation. A signature alone does not prove the truth of the article.

## Separate key issuance

Run these commands on the facts operator's secured machine. Keep the private
PEM there and never put it in Git, a ticket, or a log. This key must be
independent from the rights Worker's key:

```sh
umask 077
openssl genpkey -algorithm ED25519 -out /secure/facts.ed25519.private.pem
openssl pkey -in /secure/facts.ed25519.private.pem -pubout -outform DER | base64 | tr -d '\r\n' > /secure/facts.spki.b64
openssl pkcs8 -topk8 -nocrypt -in /secure/facts.ed25519.private.pem -outform DER | base64 | tr -d '\r\n' > /secure/facts.pkcs8.b64
```

Install the PKCS8 value only as this Worker's `FACTS_ATTESTER_PKCS8_B64`
secret, and provision an independent bearer secret as
`FACTS_ATTESTER_BEARER_TOKEN`. Copy that invocation token only into the
control-plane `RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN` secret. Configure the control plane's
`RISK_STREAM_MACHINE_FACTS_SPKI_B64` with the matching PUBLIC SPKI value from
`facts.spki.b64`. Do not install the private PEM or PKCS8 value in the control
plane. Keep this Worker's key and deployment separate from the rights attester.

See [the genuine-original operator guide](../../docs/risk-stream-genuine-originals-operator.md)
for the signed message format. The shared claims serializer is imported from
the control-plane pipeline so the signed message stays byte-for-byte aligned.
