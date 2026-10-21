# Owner-private 503 to genuine 200 gate check (2026-10-22)

This is an offline, read-only operator checklist, NOT a license, signature,
publisher permission, source HTML proof or production B2/D1 acceptance.

Current exact-main public deep health is HTTP 503; commercial Intelligence,
Global Risk and Risk Indices hot products are 0/3. The successful D1 derived
news and low-authority source-reference persistence do **not** prove signed
source-qualified commercial input. The last live original-page audit had 31
candidates, no qualified page bytes, and 13 references absent / 17 older than
6 hours / one issuer not pinned. Never repair this by altering clock, approval,
merchant scope or public health status.

## 1. Owner action: private preflight

Pull latest canonical main and work entirely on your existing secure WSL/Linux
owner machine. Do not paste private keys, source articles, rights grants, B2
credentials, reviewer objects or JSON inputs into ChatGPT, GitHub Actions logs
or a GitHub issue.

```sh
cd ~/geomacro
git pull --ff-only
node scripts/ops/owner-private-503-recovery-preflight.mjs
```

The output consists exclusively of constant safe state codes and action names.
You may share that *redacted status only*. `NOT_PROVIDED` means no path/sha in
this process environment; it does not prove the artifact never existed.
`EXACT_BYTES_PIN_MATCHED_NOT_AUTHORIZED` means **only** a local SHA matched
secure file bytes. It never means the bytes contain real Facts/Rights signatures
or a signed commercial GRO.

For source/private files use an absolute owner-only directory outside the
checkout, filesystem permissions 0700 for directories and 0600 for files. On
the actual custodian machine, set environment variables from its existing
secret manager, never in shell history or a shared paste.

### Intelligence track: legitimate material first

1. Find actually new first-party events for geopolitics, macro and critical
   minerals, with genuine issuer-native timestamps. The protected LOW review
   is an article-byte lead only. It does not certify an event or any rights.
2. Independently verify original article bytes, same-event factual claims,
   counterevidence and their actual commercial-use source scopes. Each reused
   source is checked for genuine permission or reviewed public domain and
   third-party exclusions. Do not assume no-attribution rights from a public URL.
3. Have distinct approved Facts and Rights custodians perform the canonical
   `scripts/ops/issue-offline-machine-commercial-proof.mjs` steps OFFLINE, with
   their existing real keys and real review evidence, then assemble a three-domain
   signed machine batch. Do not upload the private keys.
4. Use `scripts/ops/prepare-machine-intelligence-publication.ts` with a real
   secure batch. Set both `GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT` (absolute
   secure filepath) and `GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256` (exact file
   SHA256) privately; then repeat this preflight.
5. Once the canonical verifier qualifies it, use
   `scripts/ops/stage-approved-machine-intelligence-b2.mjs` with protected
   B2/D1 scope and quota variables exactly as in
   `docs/ops/machine-intelligence-publication.md`; enable optional
   `MACHINE_SIGNED_READY_DISPATCH_ACK=YES_NO_FUNDS` only for an already
   verified staged input. Do not set real-money acknowledgments. A dispatch
   receipt alone does not prove hot publication.

### GRI and Risk Indices track: independent review

1. Export the REAL historical GRI B2 file-version using
   `scripts/ops/export-gri-verified-history-private.mjs` according to
   `docs/ops/P0_FOUR_SIGNED_PRODUCTION_RECOVERY_20261020.md`.
   The October 8 historical anchor must match exact compressed SHA; it is
   **historical lineage, never a new current score**.
2. Independently obtain genuinely reviewed new numerical GRI v1.2, reviewer
   signature and separately certified country/category inputs; stage their
   exact private files plus SHA pins. Set `GEOMACRO_REVIEWED_INTELLIGENCE_PATH`,
   `GEOMACRO_REVIEWED_GRI_PATH`,
   `GEOMACRO_COUNTRY_CERTIFICATES_PATH`,
   `GEOMACRO_HISTORICAL_B2_READBACK_PATH` and matching SHA256 variables.
   Reviewer's approved PUBLIC key + pin also required.
3. Execute the existing `verify-three-domain-reviewed-handoff.mjs`, then
   `stage-approved-reviewed-gri-private-b2.mjs` on the private machine with
   legitimate evidence; dispatch the existing GRI publisher only after exact
   immutable B2 readback and authentication. Its successful run triggers
   independent Risk Indices B2/D1 publication. Do not authorize funds.

## 2. Exact success and automatic verification

All three outside-in **public** hot GETs must return actual 200 with current
signed B2 readback, genuine source-native dates and D1 exact payload hashes:

```sh
curl -fsS -o /dev/null -w 'Intelligence: %{http_code}\n' \
  https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/intelligence
curl -fsS -o /dev/null -w 'GRI: %{http_code}\n' \
  https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/global-risk
curl -fsS -o /dev/null -w 'Risk Indices: %{http_code}\n' \
  https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/risk-indices
curl -sS -o /dev/null -w 'Website deep health: %{http_code}\n' \
  'https://geomacro.live/api/health?deep=1'
```

Before declaring production ready, independently inspect actual B2 payload
hashes/signature pins/expiration and the deployed website SHA. A status code
by itself is not sufficient. Do not set x402 settlement authorizations until
the product-level customer-delivery, no-funds test and final owner real-money
ACK have all passed.

### What the owner needs to do

Owner/custodians control genuine article-specific rights, offline signatures
and private historical B2 export. They may keep everything on the private
machine. Only share safe aggregate status codes from the offline preflight,
Action run links and, after real publication, public hot-product readbacks;
no private input, key, signed JSON, original HTML, or license content.
