# Genuine 10-pair originals handoff — zero-funds shadow only

The checked-in JSONL specimen at
\`docs/examples/risk-stream-real-originals.UNVERIFIED.template.jsonl\`
contains exactly **20 deliberately unusable placeholder records**, arranged as
ten two-publisher events (4 Geopolitics, 3 Macro/FX, 3 Critical Minerals).
They are NOT publications and cannot pass signing. Never submit the template,
alter the event date, or create self-attested commercial rights to force PASS.

Each line in \`/secure/real-originals.jsonl\` MUST conform to
\`docs/schemas/risk-stream-real-original-candidate.schema.json\` and to
\`validateRealOriginalManifest\` in \`scripts/lib/risk-stream-original-manifest.mjs\`.
Populate each pair with **two genuinely original publications** for the same
event, same country/category/fingerprint and event_key, shared independently
verified entities, publication timestamps within 48h and not older than 72h;
distinct publisher root domains, parent media entities and source IDs. Role
pairs must be government/wire + independent regional (Geopolitics),
official statistics + market price (Macro/FX), and trade/customs + independent
industry (Critical Minerals).

\`rights_verification\` is **operator review metadata, not itself signed
authorization**. Actual rights approval must exist in the authoritative
production \`risk_stream_sources\` registry with matching identity/role and
unexpired rights, independently confirmed before copying ONLY approved source
metadata to the isolated shadow registry. A signature verifies possession of
an attester private key, NOT copyright permissions or the truth of source
content. Fact attesters must validate source hashes/originality and the
rights attester must inspect documentary reuse authority.

## Independent operator key issuance — OpenSSL 3

**Facts operator**, on their own secured machine, with private key retained
and never shared:
\`\`\`sh
umask 077
openssl genpkey -algorithm ED25519 -out /secure/facts.ed25519.private.pem
openssl pkey -in /secure/facts.ed25519.private.pem -pubout -outform DER | base64 | tr -d '\r\n' > /secure/facts.spki.b64
\`\`\`

**Commercial rights operator**, on their separate secured machine:
\`\`\`sh
umask 077
openssl genpkey -algorithm ED25519 -out /secure/rights.ed25519.private.pem
openssl pkey -in /secure/rights.ed25519.private.pem -pubout -outform DER | base64 | tr -d '\r\n' > /secure/rights.spki.b64
\`\`\`

OpenSSL generates the actual Ed25519 SPKI DER. \`ssh-keygen -t ed25519\`
creates keys in OpenSSH format, which cannot simply be treated as the
SPKI DER/PKCS8 format required here; do not base64 an \`ssh-ed25519\`
authorized_keys line and call it SPKI.

For each exact event, compute \`original_page_sha256\` as hex SHA256 of
UTF-8 \`raw_payload\`. Both operators independently evaluate and sign
the **identical** \`riskStreamOriginalClaims(event)\` JSON bytes, in the
field order defined in \`workers/control-plane/src/risk-stream-pipeline.mjs\`:
facts signs \`geomacro.machine-original-facts.v1\n\` + claims JSON;
rights signs \`geomacro.machine-commercial-rights.v1\n\` + claims JSON.
Use Ed25519 pure sign (OpenSSL: \`openssl pkeyutl -sign -rawin\` with
operator's PRIVATE PEM and the UTF-8 message from file), then base64 the
64-byte signature into the appropriate proof field.
Review metadata is not part of the signed claim and cannot by itself
authorize a registry source.

**Owner-only**, after obtaining independently signed real records, install
both PUBLIC keys and protected compressed ORIGINALS as one prevalidated
operation (no private PEMs uploaded):
\`\`\`sh
node scripts/ops/provision-risk-stream-shadow-attester-keys.mjs /secure/facts.spki.b64 /secure/rights.spki.b64 /secure/real-originals.jsonl --apply --stage-originals
\`\`\`

This stores the 20 signed original records in a bounded protected GitHub
environment secret, never in Git, PR diffs, logs or public R2. If the
independent operators have not supplied legitimate source publications and
rights-reviewed source registry IDs, **do not run this command**.

Trigger the protected main-only no-funds shadow workflow:
\`\`\`sh
gh workflow run risk-stream-shadow-provider-audit.yml -R blocknine0/geomacro --ref main -f approval=RUN_ISOLATED_SHADOW_INDEX_ONLY_NO_FUNDS
\`\`\`
Its isolated candidate policy parity is not the production D1 governor
parity. The terminal \`SHADOW_AUDIT_PASS\` is permitted only after the
same-run 30 index hints, 20 independent original attestations, ten actual
GRO signatures verified against isolated D1 payloads and the GRO public
key, and zero observed D1 503. The production canary hold and customer
delivery remain disabled.
