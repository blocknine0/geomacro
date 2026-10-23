# Commercial production live readiness, no funds — 23 October 2026

## Evidence from real actions, not optimistic static CI

- `main` as observed during the audit: `be11ba9b9ceb01a667a4bcffd5905570d8366405`. Live Lovable deployment marker reported `90b60061f54b12b81de7f17af2fa31b4c898eea1`. The source mirror action succeeded but that does **not** publish the Lovable website. Publish from the actual Lovable production project and re-check the exact live build marker.
- [Production Website Health run 39914596996](https://github.com/blocknine0/geomacro/actions/runs/39914596996) returned deep-health HTTP **503**, `production_data_runtime_configured=false`, current Intelligence/Global Risk/Risk Indices **0/3**, and `/api/intelligence` HTTP 503. D1 control-plane `/health` 200/schema 5 is not proof of current signed hot products.
- [Read-only D1 production diagnosis 39914892372](https://github.com/blocknine0/geomacro/actions/runs/39914892372) reported genuine hot metadata **SOURCE_TOO_OLD + EXPIRED** and missing externally approved signed input hints. Do NOT prolong `generated_at`, `source_as_of` or `expires_at` to convert stale records into fresh, nor read expensive B2 cold objects before metadata admission.
- [Live x402 no-funds run 39914892452](https://github.com/blocknine0/geomacro/actions/runs/39914892452) reported deep-health 503, prelaunch discovery 200 and x402 availability 422. The global country/corridor no-funds census reported zero verified paid coverage.
- [Delegated Derived run 39869208443](https://github.com/blocknine0/geomacro/actions/runs/39869208443) genuinely signed a no-funds aggregate over 24 previously signed derived items. The restricted Pallab/Suman standing authorization is **free derived-only**; it cannot authorize paid publisher rights, independent numerical GRI, current hot products or USDC settlement.

## Durable operational sequence

1. **Deployment**: Check that canonical `main` has fully mirrored to the Lovable source repository. Then *actually Publish changes* in Lovable to `geomacro.live`. The current build marker must match the current canonical 40-byte SHA. A green mirror check or reload does not count.
2. **Independent Intelligence publisher**: Collect NEW native-date genuine original evidence (not merely generic publisher notices) with verified scope-appropriate rights. Submit through the already protected Machine Facts + Rights independent signatures, B2 write/readback, D1 signed hot promotion. Native source times must meet the live health window. Automatic 5-minute derived news receipts do not satisfy this step.
3. **Independent reviewed numerical GRI**: Require Suman's actual signed scored reviewer input, independently eligible source evidence and country/category certificates, consistent GRI v1.2 signing anchors and immutable historic B2 ancestry. Existing protected reviewed publisher must validate and publish independently from Facts/Rights or generic derived consent; Risk Indices refreshes only from a valid newly verified GRI parent. Rewriting expiry metadata or reissuing old receipts is not recovery.
4. **Live no-funds acceptance**: The separate `Live Commercial Go-No-Go No Funds` workflow reads the *deployed* SHA, deep-health 3/3, public x402 discovery and **one** representative no-payment availability quote. RED when blocked is correct. It issues only sanitized reason codes, no source, B2 object read, Supabase, credentials, D1 mutation or x402 payment. Its green result is NOT a certificate for 195 countries or all corridors and NOT proof of legal source rights.
5. **Commercial authorization**: Independently confirm one real commercially eligible intended structured product with correct locked prices, original-source rights, fresh verified proof, signed delivery, agent/buyer authentication, idempotency/replay ledger, refund/reconciliation and no-funds preflight. Only then the **owner's separate real-USDC ACK** and first exact-price externally settled purchase are appropriate. A successful payment must be reconciled on chain/provider and ledger before claiming revenue.

## Automatic continuation already in place

- `five-minute-original-news-fastlane.yml`: free derived-news ongoing collection.
- `gri-signed-ready-cadence-backstop.yml`: 15-minute conditional cloud dispatch of REAL approved short-lived reviewer/Facts/Rights hints only; no fictional signatures.
- `production-website-health.yml`: strict public 200/3-of-3 checks after approved publisher workflows and main pushes.
- New `commercial-live-production-no-funds.yml`: 6-hour best-effort scheduled and health-triggered independent *real deployment* no-funds gate. GitHub scheduler is not a 24/7 uptime SLA.

## Safety and separation

Do not alter the fixed capability price list, issue new derived-data licences merely because raw data is not redistributed, auto-generate independent reviewer approvals, shift paid products to stale unscored news, expose credentials or execute USDC settlement from CI. Existing signed hot, Rights, independent reviewer, ledger and strict x402 fail-closed conditions remain authoritative.

The static `Exact-Head Commercial Launch Readiness` is now explicitly labeled **STATIC_PRELAUNCH_CODE_CHECKS_PASSED_LIVE_UNVERIFIED**, never `READY_FOR_OWNER_ACTIVATION` based only on code.

## Pre-mainnet migration safety: GitHub runner cross-device EXDEV fix

On PR #2722 the existing `Pre-Mainnet x402 Zero-Fund Acceptance` database
safety step failed because `check-migration-safety-history-aware.mjs` tried
to `rename` independently verified production-history-only SQL migrations
from the GitHub workspace into `/tmp`, which is on a different filesystem
on the current runner image. The code now quarantines under a temporary
hidden directory **inside the same checkout**, then invokes the unchanged
`check-migration-safety.mjs`, restores every parked file in `finally`
and deletes its temporary directory. No SQL migration, Supabase table,
production data or history allowlist was changed. Added a regression test
that exercises move/restore and verifies the mandatory full safety checker.
