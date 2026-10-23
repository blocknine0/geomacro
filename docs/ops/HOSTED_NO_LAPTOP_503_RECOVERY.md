# Geomacro hosted, no-laptop signed-product recovery

## Objective
The owner's laptop is **not** a production daemon. GitHub-hosted Actions,
Cloudflare Workers/D1 and Backblaze B2 perform existing supported scheduled
ingestion, live serving, immutable signed data publication and verification.
GitHub schedule is best-effort; Cloudflare public serving remains independently
available. No unreviewed source is self-approved for commercial publication.

## Existing automated production infrastructure

- `five-minute-original-news-fastlane.yml`: scheduled 5-minute, source-native
  official news candidate intake and 72h derived-only D1 journal; not current
  signed Intelligence, and no source-private customer delivery.
- `website-derived-news-continuity.yml`: hourly three-domain official derived
  news; `auto-ingest-news.yml` and the website cadence backstop provide
  separately staggered missed-ingest recovery.
- `gri-signed-ready-cadence-backstop.yml`: **existing** 15-minute cloud
  workflow checking ONLY externally approved short-lived hashes for
  independently reviewed GRI and separately Facts/Rights dual-signed Machine
  Intelligence. Missing approved SHA hints short-circuit without any B2 read.
  Authenticated protected publisher jobs recheck actual signed bundles,
  source rights, native clocks, quota and immutable B2/D1 readback.
- `signed-hot-pre-expiry-guard.yml`: metadata-only expiry monitor.
- `hosted-authority-readiness.yml`: new daily & on-demand, `production`
  environment public-key crypto/config diagnostic, plus PR-only offline
  tests. It prints no PEM, private key, fingerprint, path, credentials, source
  article, rights document, signed envelope, proof or customer data. Each
  field is only a bounded state code.

## 2026-10-22 correction: Lovable B2 S3 secrets are NOT a required prerequisite

Actual `src/routes/api.health.ts` deep readiness reads the authenticated,
B2-backed Cloudflare edges and **three independently verified current
Cloudflare D1 hot products**. The app does **not** need new direct S3
`B2_ARCHIVE_READ_KEY_ID` / `B2_ARCHIVE_READ_APPLICATION_KEY` secrets in Lovable.
The legacy health property `b2_runtime_configured` is calculated from
readable, validated B2-backed **edge baselines**, *not* from testing S3
secret presence in Lovable. The public app's own fallback helper can support
optional protected private reads, but their absence is not a safe explanation
of a missing current signed hot proof. Do not copy private B2 key material
into Lovable merely to make a health flag green.

The *separate GitHub protected issuer/staging workflows* require approved
B2-scoped storage credentials in their existing **production** environment
as appropriate. Keep keys there or in the authorized original issuer's
secret manager; do not print, reuse browser/client secrets or regenerate an
independent authority. Even valid GitHub B2 storage credentials cannot
replace source-native 22h evidence, Facts + Rights signatures, reviewed
numerical GRI v1.2, reviewer public pin, independent historic B2 lineage,
exact B2 upload/readback or current D1 promotion.

Actual Oct 22 live state at 13:30 UTC: D1 health 200/schema 5;
three signed hot products stale/expired (0/3), website deep 503,
archive historic anchor is a valid *historical* D1 record but is not now
readable B2 proof. x402 remains controlled/no funds. A new Lovable Publish
synchronizes source SHA but does not reissue genuine independent proofs.

## What the owner needs to do once (NOT 24/7)
1. In GitHub **Settings > Environments > production > Environment secrets**
   and repository Actions secrets, review the **names** (not values) of
   B2_KEY_ID, B2_APPLICATION_KEY, CLOUDFLARE_ACCOUNT_ID,
   CLOUDFLARE_API_TOKEN, GEOMACRO_COMMERCE_LEDGER_TOKEN,
   GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM and SHA256,
   GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM and SHA256,
   RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64,
   GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM and SHA256.
   Reuse already scoped protected values; never regenerate/revoke a healthy
   identity to make a metadata check green. Approved key hashes are over the
   **DER SPKI Ed25519 public key**, not over textual PEM bytes.
   Facts, Rights, GRO and independent GRI reviewer MUST be distinct
   independently governed identities. Do not place Facts/Rights private keys
   in GitHub Actions or Cloudflare.
2. Run [Hosted Authority Readiness](../../.github/workflows/hosted-authority-readiness.yml)
   as a GitHub Actions `workflow_dispatch` on `main`. Its daily check only
   proves non-secret public key pin and environment configuration, not any
   commercial source grant or signed current scores. Green is NOT a paid launch.
3. Have the genuinely independent Facts and Rights custodians supply future
   approved **event-scoped** proofs/signatures through their separately
   authorized signing service or one-time offline process. They can operate
   their own controlled cloud signer but need genuine review scope and
   explicit custody authorization. Never auto-sign based only on an RSS
   feed, source age, public-domain guess, LLM output or web URL.
4. Once *real* three-domain signed exact input is qualified and stored in
   protected B2 with immutable verified SHA, set the **existing**
   short-lived externally approved GitHub variable hints
   `MACHINE_INTELLIGENCE_READY_INPUT_SHA256` and
   `MACHINE_INTELLIGENCE_READY_APPROVED_AT`. The existing 15-minute
   backstop may dispatch the protected publisher when the hints are recent.
   The signed publisher will fail closed on invalid B2 evidence,
   Facts/Rights authority, rights, country/category, source clocks or
   product readback. Alternatively the authorized owner/custodian may use
   the existing `machine_intelligence_dual_signed_ready` repository dispatch.
5. The independent GRI reviewer separately provides **genuine numerical**
   GRI v1.2 proof, reviewer Ed25519 signature, current country/category
   certificates and the exact restored historic B2 GRI bytes. The existing
   reviewed-GRI immutable B2 staging workflow verifies these and may submit
   the `gri_reviewed_current_ready` dispatch. Existing
   `GRI_READY_REVIEWED_SHA256`, `GRI_READY_CERTIFICATES_SHA256` and
   `GRI_READY_APPROVED_AT` are just short-lived cues. The successful
   genuine current GRI publisher triggers risk-indices verification.
6. Confirm three distinct actual public 200 responses with current valid
   signed B2 hashes and D1 proofs, then public deep health HTTP 200 and
   canonical deployed site SHA. x402 real settlement must stay fail-closed
   without separate owner-approved real-money launch acknowledgement.

## Why the user's WSL preflight was all NOT_PROVIDED

`owner-private-503-recovery-preflight.mjs` reads the **calling WSL process
environment and local files**, not GitHub Actions Environment secrets, B2
object contents or Cloudflare bound runtime secrets. An empty laptop shell
does not prove the cloud has no credentials. The new cloud workflow uses its
own protected `production` environment and correctly reports only whether
the public identity configuration matches its approved pins.

**What the new workflow does not and cannot do:** Generate legally valid
rights from third-party terms, independently approve facts/GRI, unlock signer
private keys, archive unavailable original bytes, bypass finite B2 quotas,
fabricate scores, extend expired source publication timestamps, replace
genuine 503 with synthetic 200, or spend USDC. If input-qualified publishing
is genuinely unavailable, the correct current hot state stays 503/0-of-3.

## Safe inspection
[Hosted Authority Readiness](../../.github/workflows/hosted-authority-readiness.yml)
Actions logs contain only fixed readiness classes and action labels. If any
class reads `MISSING_OR_INVALID`, check the existing approved key/credential
*scope* in GitHub Settings. Do not copy credentials, source content or private
signatures into issues, logs or a chat. No laptop cron, Windows Task
Scheduler, or 24/7 local tunnel is required.


## Automatic derived approvals across all news lanes (23 October)

The already enrolled standing delegation continues without per-story human
approval. The existing standing-derived workflow now wakes after Auto Ingest,
Fastlane and all six continent sweeps, plus its existing hourly recovery. A
completed source may be an actual ancestor of newer main; a foreign or
unrelated source is rejected before any signing. No new cron is created.

Each continuation reads the complete retained public derived journal, excludes
duplicate IDs and already signed inputs, signs missing **derived-ingestion**
envelopes with the existing production issuer, and independently verifies the
complete retained input signatures. Only then may a separate runner use the
already enrolled delegated machine to sign its readback audit. The issuer
private key and delegated private key are never on the same runner. A failed
producer/readback does not satisfy the dependent delegation job.

This automatically covers retained derived stories from continent and 24-hour
backfill runs; it does not claim that every story has an independently verified
original page. Original-page reviews remain the existing separate low-authority
Fastlane process. Invalid, unavailable or uncovered evidence stays unverified.

The signed standing policy explicitly denies numerical GRI, independent review,
upstream commercial-rights grants and paid settlement. Its existing signatures
cannot authorize these additional scopes by changing code or an environment
flag. Protected GRI and machine publishers continue automatically once their
real scoped approval inputs are available. Numerical GRI is still blocked until
that actual review package exists; this continuation does not remove that
requirement or report 3/3 current scored products.


## Permanent owner/reviewer approval inbox (23 October 2026)

The existing `.github/workflows/gri-signed-ready-cadence-backstop.yml`
now emits a sanitized **Pallab/Suman human-action checklist** in its GitHub
Actions job summary on every eligible existing 15-minute hosted wakeup. It does
not add another schedule, pay, read B2, write D1 or require a running laptop.

The new `scripts/ops/report-pallab-suman-hosted-handoff.mjs` maps **only**
already checked, time-bounded GRI/machine-SHA pointer hints and the result
of the actual protected owner signature admission gate to these roles:

- **Originals, Facts and Rights:** a genuine qualifying original-page/
  article-specific rights record and separately approved Facts/Rights signed
  machine batch must be supplied by the actual authorized custodians.
- **Suman Dey:** after independently verifying the real current GRI v1.2
  inputs, he must sign the reviewed numerical GRI and each genuinely
  qualified country/category certificate in his own OS account.
- **Pallab Das:** after checking Suman's exact signed inputs, sign the
  existing SHA-bound owner approval using the owner private key. An old
  signature or a derived-only consent does not substitute.
- **GitHub cloud publishers:** after immutable B2 staging and valid pinned
  approval cues, existing protected pipelines perform actual signature,
  rights, country, B2/D1 and current public readback verification. Missing
  signatures or commercial rights remain blocked.
- **Payment:** x402 settlement stays off pending independent real-money
  owner ACK and live delivery acceptance.

The summary is intentionally a *work queue*, not proof that a human has
performed any action or that production HTTP 503 has been fixed. It never
prints key material, original page content, approval hashes, source paths,
rights grants or private reviewed JSON. A successful scheduled workflow
with a skipped publisher still means no current signed product. The
`Gri Automated Policy Consent` continues to govern **derived-only audit**,
not human-reviewed commercial numerical GRI.

Human actions are **on demand**, not 24/7 laptop work; each genuinely reviewed
signed batch can be handed off once and resumed by the existing cloud cadence
with immutable B2 paths and actual protected validation. No artificial
source freshness, scope enlargement or synthetic score is authorized.


## Every retained news item gets a signed **derived** input (23 October 2026)

All three categories use the exact same 72-hour D1 derived journal.
The current automated publisher `publish-automated-intelligence-inputs.ts`
already signs every canonical content-unique retained item with the approved
**derived-ingestion Ed25519 issuer**, persists the envelope to existing D1
and independently verifies publication using
`verify-all-news-signed-publications.mjs`. Each new canonical content
revision is separately signed; identical duplicates are not reissued.
Failed or missing signatures are NOT hidden by successful collection jobs.

Previously the standalone 15-minute-independent derived signing continuation
listened for Fastlane, Auto Ingest and six continent sweeps, but not both
distinct direct D1 writer completion events. The signed derived backstop
now also wakes after:
- `Website Derived News Continuity` (primary D1 derived publisher)
- `Website Derived News Cadence Backstop` (conditional recovery publisher)

The existing main-only ancestry verifier checks the trusted repository,
successful producer, protected canonical main and commit ancestry; an
indirect workflow_run producer event is admitted ONLY for these two named
trusted D1 writers. All other untrusted nested events are rejected.
The same **existing hourly fallback** remains; there is no extra cron,
always-on laptop, new B2 ticket, Supabase, paid API or human key export.
Cloud scheduler delays and failures remain possible. The independent
signed-readback step will fail closed when an item lacks its proof.

A Geomacro ingestion signature proves exact owned *derived content
integrity only*. An unverified source candidate remains unverified;
signing it does not imply original HTML-byte verification, legal rights,
independent Facts and Rights authority, country/category certificate,
numerical GRI v1.2, Risk Indices publication, a signed GRO or x402
commercial delivery. Those are separate genuine-input requirements.
