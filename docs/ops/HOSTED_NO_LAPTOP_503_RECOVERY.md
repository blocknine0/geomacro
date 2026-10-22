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
