# Geomacro private automated source review (LOW)

Owner policy: a separate low-authority automated reviewer checks real source
evidence for automatically issuer-approved derived intelligence. Manual item
approval is not required. Source URLs, evidence bytes/digests, reviewer identity,
private verdicts and the review history must not be added to buyer responses.

The LOW scope is original page authenticity and native publication time. It
does not certify semantic claims, independent corroboration, article rights,
numerical scores or commercial payment authorization. Signed receipts explicitly
say internal automated review, external_reviewer_attested:false,
semantic_claims_verified:false and commercial_authorization:false. They cannot
be substituted for the existing independent GRI or commercial certificates.

## Execution and authority separation

The hourly and five-minute producers prepare a 0600 source-reference file in
RUNNER_TEMP. After automatic issuer signing, a separate producer step preserves
the exact original reference in protected D1 control state. The Worker verifies
the signed input, reproduces the original-to-derived mapping, and requires its
exact signed journal ID. A different URL cannot be attached merely because its
derived category/summary resembles another input. The existing public journal
and customer responses do not gain original-reference fields.

The hourly reviewer and a separate job after the existing five-minute producer
read these retained handoffs with the restricted LOW capability. Losing the
producer runner no longer loses the only source mapping needed for later
verification. No new schedule is added. Full HTML bodies are not retained.
The reviewer executes the same bounded pinned-publisher HTML/native-date verifier.
The old and new HTML audit do not both run: at most four normal page GETs
across categories, one per issuer host; two requests remain protected reserve.
All other items receive explicit pending/deferred/rejected verdicts rather
than fabricated source verification. Valid signed successful receipts are reused
only within their existing review window while the original is still within
the six-hour native source window. Their timestamps are not advanced. This lets
the next pending original consume the next run's readback slot instead of
rechecking the same newest cards indefinitely. Rejected original requests have
a 30-minute cooldown; invalid or expired prior receipts cannot suppress checks.

This is internal process/key separation, not an external institutional audit.
The reviewer receives its dedicated Ed25519 private key and pinned public key.
The issuer private key, rights key, B2 keys, Cloudflare API credential and full
control-plane writer token are absent from its workflow step. The new token
is HMAC-derived for signed PUTs to /v1/internal/low-source-reviews and read-only
GETs from /v1/internal/source-handoffs. It cannot write source handoffs. The general admin
writer rejects it. The Worker accepts only the narrow signed LOW contract
under a separately pinned reviewer key, different from every registered issuer
key. The reviewer cannot upgrade source receipts to paid or scored products.

Receipts bind the canonical intelligence input hash, category, source time,
review time, explicit scope, status and private exact HTML digest when verified.
They are stored only in the existing D1 control_state table under a dedicated
prefix with 72-hour native-date expiry and a 600-record bound. There is no public
review route, no partner route, public review artifact or source/evidence field
added to the customer API. Source mappings have a separate private prefix,
the same native 72-hour expiry and 600-input capacity. Expired mappings are
excluded from reads and pruned on subsequent writes; mappings whose signed
input was evicted are pruned too. Cleanup never touches other namespaces.
Private responses use `private, no-store`; root/producer credentials cannot
read this restricted handoff route and the LOW credential cannot write it.
Write and read pages are bounded by both record count and UTF-8 size.
Runner IPC/results are removed in always-run cleanup steps.
No new cron, paid review service, B2 operation or Supabase dependency is added.

## One-time protected configuration

Provision a dedicated key through the owner's existing protected secret manager:

- GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64
- GEOMACRO_LOW_REVIEW_PUBLIC_PEM
- GEOMACRO_LOW_REVIEW_PUBLIC_SHA256 (SHA-256 of DER SPKI)

From a current checkout on the owner's authenticated machine, with Node and
GitHub CLI installed, run `gh auth login` if needed, then:

```sh
node scripts/ops/provision-private-low-review-authority.mjs --check
node scripts/ops/provision-private-low-review-authority.mjs --provision
```

The helper targets only this repository's production environment. It generates
a new dedicated key in memory and passes values to `gh secret set` on stdin;
no key file, private output or command-line secret is created. Existing complete
configuration is left unchanged (presence alone does not verify its values).
Partial configuration stops without overwriting a trust anchor. If a network
failure interrupts provisioning, recover that partial configuration through the
owner's protected secret manager before trying again. Provisioning is not a
live deployment or review receipt. This session cannot execute the helper's
write path because no authenticated GitHub CLI/admin credential is available.
The owner subsequently ran this helper successfully and reported PROVISIONED;
protected values were not shared in chat. PRs #2588 and #2620 subsequently
established a successful protected review/write run. A successful narrow LOW
review still does not establish semantic or commercial approval.

Do not reuse the issuer or facts/rights authority private key. No private key
belongs in chat, Git, an artifact, command arguments or the Worker. Deployment
transfers only the public reviewer key/pin to the control-plane Worker. The
existing control-plane root derives the scoped reviewer token at runtime.
The verifier checks the dedicated private/public pair and pin before any page
GET. Missing keys, changed pins or issuer-key reuse cause a visible failure,
not an unsigned or self-reviewed fallback. The free news journal remains
independent and is not erased by a reviewer failure.

Source implementation in a PR is not deployment evidence. Each continuation
change requires main merge, Worker deployment and a successful actual private
handoff/read/review/write run. No commercial hot 3/3 claim follows from this.

## CI and live evidence

Pull-request GRI calibration and Growth rendering use explicitly labeled pinned
or synthetic fixtures. Those modes refuse manual/live invocation and do not
authorize production readiness claims. Manual production runs retain real feed,
current snapshot, rights and publication checks.

Disposable staging uses the canonical D1 Risk Gate handler, real SQLite SQL,
fresh synthetic Ed25519 fixtures and a loopback-only development proxy. The
production code-level key pin rejects those fixtures; no HTTP field or runtime
environment variable can replace it. This is SQL-compatible staging evidence,
not proof of a deployed Cloudflare D1 binding or commercial source validity.
