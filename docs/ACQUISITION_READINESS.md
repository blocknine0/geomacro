# Geomacro Acquisition Readiness and Handover Control

**Status:** diligence-readiness control document  
**Audit baseline:** `3d7d19e8c59cf2323444488ca2eee1f7b8426789`  
**Scope:** current Geomacro intelligence product, GRI, signed Risk Objects, Risk Gate, APIs, data pipelines, supporting Arc/Circle technical rails, repositories and deployment infrastructure.

This document distinguishes what repository evidence proves from what still requires founder, provider, legal or independent third-party action. It must not be used to claim legal clearance, an independent audit or completed buyer handover before those actions occur.

## Executive result

**Engineering transferability: CONDITIONALLY READY.** The canonical source, database authority, environment contract, build/test commands, release controls, signing lifecycle, source-rights gates and substantial operational runbooks are documented. The product is technically capable of being handed to another engineering team.

**Legal/IP transferability: NOT YET PASS.** The repository uses `Geomacro` as copyright holder while the project is founder-led. A transaction must identify the actual legal owner of every asset and obtain/verify assignments for every material non-founder contribution before representing clean title.

**Founder independence: NOT YET PASS.** The repository contains enough documentation to run a formal clean-room test, but no independent new operator has yet completed the entire fresh-environment deploy -> database -> ingestion -> GRI -> signed Risk Object -> Risk Gate -> recovery sequence without founder knowledge.

No blocker found in this audit requires redesigning the core product. The remaining blockers are predominantly ownership evidence, account/provider transferability, credential rotation and an independently witnessed clean-room run.

## 1. Canonical asset map

| Asset | Current evidence / authority | Acquisition treatment |
|---|---|---|
| Application source | `blocknine0/geomacro:main` | Transfer repository to buyer-controlled GitHub organization/account; preserve full Git history and reviewed commit evidence. Never hand over a personal GitHub password. |
| Lovable deployment mirror | `blocknine0/geomacro-160c8e56:main` | Secondary deployment mirror only. Transfer/recreate after canonical repository. Do not treat it as IP authority. |
| Frontend / SSR hosting | Lovable publishing surface | Verify provider account/project transfer or recreate under buyer account from canonical source. Rotate mirror token and hosting secrets. |
| Production application DB | Supabase project ref `ldpwajisioljyjtojvfx` | Export/backup and transfer project if provider permits, otherwise restore into buyer-controlled project and update the explicit authoritative-project guard in a reviewed migration/release. Rotate service-role material. |
| Historical warehouse | `HISTORICAL_SUPABASE_*` server-only contract | Inventory the exact project/account, source rights and backup/restore path before closing. Transfer/recreate without exposing service-role keys. |
| GRI | Versioned compute/verify/validate/replay scripts | Transfer code, methodology artifacts and provenance subject to underlying source rights. Preserve version/hash evidence. |
| Signed Risk Objects | Ed25519 issuer/signing + verification registry | Buyer creates a new active issuer key; retire founder-era normal key after controlled cutover. Never transfer private signing material through source control or diligence files. |
| Risk Gate / governed APIs | Server/API code + release controls | Transfer with audit/idempotency DB state and exact external contract/version documentation. |
| Arc/Circle technical rails | Circle SDK, x402, Arc Testnet/onchain proof | Transfer code/config and public contract addresses. Provider memberships, grants, Alliance status or accounts are not presumed assignable; obtain provider confirmation. |
| Onchain admin controls | Signing runbook / wallet-controlled authority | Transfer control by an explicit buyer-approved onchain/admin procedure. Never share seed phrases in documentation or chat. |
| Domain / DNS / brand | `geomacro.live` and Geomacro brand are product assets but registrar/trademark evidence is outside repo | Add registrar account/domain ownership evidence and any trademark/brand assignment to closing schedule. |
| External datasets/APIs | Governed by `docs/COMMERCIAL_SOURCE_RIGHTS.md` | Transfer Geomacro-derived IP only within each source's exact licence/contract. Buyer may need new API/provider credentials or contracts. |

## 2. IP-title findings

### A. Proprietary code boundary

`LICENSE.txt` reserves Geomacro source code, smart contracts, application logic, interfaces, AI workflows, data models, documentation and designs, while separately excluding reusable primitives published in the agent-primitives repository. This is a useful public licensing boundary, but a licence notice is not itself proof of legal title.

### B. Required ownership schedule

Before acquisition closing create a signed asset/IP schedule identifying:

1. the founder/legal person or entity that owns the Geomacro copyright, brand, domain and proprietary datasets/derived assets;
2. every person who authored material code, design, documentation, data transformations or other copyrightable work outside that owner;
3. the employment/contract/contribution agreement or specific IP assignment covering each such contribution;
4. every repository included/excluded from the transaction;
5. every third-party/open-source component and its licence;
6. every external dataset/API and its commercial/redistribution boundary;
7. any asset that requires buyer re-contracting rather than assignment.

**Blocking rule:** if a material contribution has no clear written ownership/assignment path, mark it `TITLE_REVIEW_REQUIRED`; do not state clean IP title to a buyer until resolved.

### C. Contribution policy gap

`CONTRIBUTING.md` says accepted contributions *may* be subject to additional IP terms. That does not retroactively establish an assignment for an already accepted contribution. Before closing, reconcile Git history/PR authors against signed assignments or other applicable ownership evidence.

## 3. Dependency and third-party software map

The JavaScript application is private and currently uses pinned/ranged packages recorded in `package.json`/`bun.lock`, including Circle SDK packages, Supabase, TanStack, React, ethers, x402, AI/provider SDKs and UI libraries. Solidity dependencies are submodules for Foundry `forge-std` and OpenZeppelin contracts.

Buyer diligence must preserve a generated SBOM/licence report for the exact closing commit. The presence of a package in this repository does not mean Geomacro owns it. Third-party code remains under its upstream licence.

**Closing gate:** run an automated dependency/SBOM/licence scan at the exact closing candidate SHA and manually review any copyleft, source-available, non-commercial, unknown/custom or deprecated licence result. Store the report in the diligence data room; do not commit secrets or proprietary scanner credentials.

## 4. Data and API rights map

`docs/COMMERCIAL_SOURCE_RIGHTS.md` is the controlling engineering register. Its fail-closed model must survive acquisition.

Current reviewed examples include commercially eligible, attribution-bound paths for specific World Bank WDI/WGI, UNHCR Refugee Population Statistics, UCDP GED and USGS MCS inputs. UCDP Dyadic remains review-gated in its current adapter path; sanctions evidence remains review-required; ReliefWeb paths are derived-only where explicitly marked.

**Transfer rule:** an acquirer receives Geomacro code/methodology/derived intelligence rights only to the extent Geomacro owns them and each underlying source permits the relevant use. Raw third-party data must not be described as proprietary Geomacro IP. Provider/API credentials should be replaced with buyer credentials where account assignment is unavailable.

## 5. Provider and account transfer matrix

Before signing/closing, the seller and buyer must fill this table with provider-confirmed answers. `UNKNOWN` is intentionally a blocker to claiming completed operational transfer.

| Service/control | Current role | Assignment/change-of-control status | Closing action |
|---|---|---|---|
| GitHub | canonical source + CI | buyer-controlled repo transfer supported operationally; account-password transfer prohibited by this runbook | transfer repos/org ownership, install buyer credentials, rotate tokens |
| Supabase | application DB + historical warehouse | UNKNOWN until account/project terms and current plan are checked | transfer project if allowed or backup/restore to buyer project; rotate keys |
| Lovable | hosted frontend/SSR + linked mirror | UNKNOWN | confirm project transfer or recreate deployment; rotate all secrets |
| Domain registrar/DNS | `geomacro.live` | UNKNOWN | transfer domain/registrant or push to buyer registrar; rotate registrar/DNS auth |
| Circle / Arc | SDK/technical ecosystem relationship and Testnet rails | membership/program/account transfer NOT ASSUMED | ask Circle/Arc whether relationship, grant/application or account survives asset sale/change of control; buyer creates credentials as required |
| Coinbase CDP | optional isolated x402 rail | UNKNOWN | buyer creates/recontracts credentials unless provider explicitly permits transfer |
| GOAT Flow | partner pilot rail | UNKNOWN | obtain partner consent/recontract; never transfer merchant secrets informally |
| Groq / Gemini / Mistral / Cerebras / Lovable AI | classifier/provider chain | UNKNOWN per account | buyer creates or assumes approved accounts; rotate API keys |
| RPC providers | payment/onchain verification | UNKNOWN | replace endpoints/keys under buyer account |
| GitHub Actions secrets | deployment/ops credentials | non-exportable as plaintext by design | recreate from buyer-owned secrets; revoke seller-era credentials |
| Risk Object issuer key | signed Risk Objects | cryptographic control, not an account | generate buyer key, publish active verification entry, retire old normal key |
| privileged wallets/admin | testnet/onchain admin | wallet/control-specific | explicit control transfer or redeploy/reassign; never share personal seed phrase |

## 6. Credential and control cutover

No acquisition handover should rely on old personal passwords.

1. Buyer establishes its own GitHub organization/account administrators.
2. Transfer canonical repositories and required mirrors with history.
3. Buyer provisions its own provider identities and secrets.
4. Recreate GitHub Actions/hosting/database secrets from buyer-owned credentials.
5. Rotate Supabase service-role/DB credentials where supported and invalidate seller-era credentials.
6. Generate a buyer-controlled Risk Object signing key. Publish its public verification material and activate it through the governed lifecycle.
7. Retire the prior uncompromised issuer key after cutover; revoke only if compromise is suspected.
8. Transfer/reassign onchain admin authority through the documented signing process; do not copy seed phrases into a handover package.
9. Transfer domain/DNS control and enable buyer MFA/recovery methods.
10. Re-run production readiness and smoke tests at the exact post-cutover commit/configuration.
11. Seller verifies all seller-controlled credentials/tokens have been revoked or removed.

## 7. Founder-independence clean-room acceptance test

The tester must be a technically competent person who did not build the relevant subsystem and must not receive undocumented founder instructions during the run. Questions/blockers are recorded as findings, not silently answered and forgotten.

### Stage 1: source and reproducible build

- clone canonical repository using buyer/tester identity;
- checkout the frozen candidate SHA;
- initialize submodules;
- install the documented Bun version/dependencies from the lockfile;
- run applicable lint, application tests, build, database-safety and hosting-alignment checks;
- record commands, versions and results.

### Stage 2: environment and database

- provision a fresh non-production environment using `.env.example` as the secret/config inventory;
- use newly issued test credentials, never copied founder passwords;
- provision/restore the application DB from documented migrations/backup;
- run target/schema safety checks;
- verify the runtime cannot silently select an unrelated hosting database.

### Stage 3: intelligence pipeline

- run a bounded source ingestion using commercially eligible/test-safe inputs;
- verify unverified/review-required inputs fail closed for paid delivery;
- compute GRI using the current canonical methodology;
- verify/replay the resulting snapshot and retain provenance/version/hash evidence.

### Stage 4: Risk Object and Risk Gate

- generate a fresh test issuer key under tester control;
- generate/sign a machine-readable Risk Object;
- verify signature/key lifecycle behavior, including tamper/expiry/revocation negative cases where the existing test suite supports them;
- call the current Risk Gate/API contract with a supported subject;
- verify immutable audit/idempotency evidence and `execution_authorized=false` boundary.

### Stage 5: deploy, observe and recover

- deploy the exact reviewed source into a clean staging environment;
- run readiness and authenticated smoke checks;
- exercise one documented dependency failure/fail-closed scenario;
- exercise rollback/disable and recovery using the release runbook;
- verify logs/evidence contain no private key/service-role/customer secrets.

### Stage 6: founder removal simulation

For the final pass, disable all tester access to seller/founder personal accounts. Repeat a bounded build, deploy/readiness check, GRI verification and Risk Gate request using only buyer-controlled identities. If any step requires a founder account, undocumented value or founder-only decision, the test fails and the dependency is recorded.

## 8. Evidence package required for PASS

Store outside public source control where sensitive/business-confidential:

- exact candidate and closing commit SHAs;
- repository/asset schedule and exclusions;
- contributor/authorship report plus signed IP assignments/agreements;
- SBOM and third-party licence report;
- dataset/API rights register and unresolved exceptions;
- provider assignment/re-contract confirmations;
- domain ownership/transfer evidence;
- database backup + restore-test evidence;
- clean-room command transcript and CI/test artifacts;
- GRI reproducibility/provenance evidence;
- Risk Object signing/verification evidence using test keys;
- Risk Gate audit/idempotency evidence;
- rollback/recovery exercise evidence;
- credential-rotation/revocation checklist with no secret values;
- buyer acceptance sign-off and remaining limitations.

## 9. Current blocker register

| ID | Severity | Finding | Resolution needed for acquisition-ready PASS |
|---|---|---|---|
| AR-01 | HIGH | Legal IP owner is not evidenced by the repository; `Geomacro` copyright label is not sufficient title evidence. | Identify seller/legal owner and execute/collect appropriate IP/asset ownership documents with transaction counsel. |
| AR-02 | HIGH | Contributor assignment coverage has not been reconciled against full Git/PR history. | Produce authorship/contributor report and obtain/verify assignments for all material non-owner contributions. |
| AR-03 | HIGH | No independent end-to-end founder-removal clean-room run is evidenced. | Execute stages 1-6 with an independent tester and retain evidence. |
| AR-04 | MEDIUM | Provider account/project assignment/change-of-control status is not documented for Supabase, Lovable, domain/DNS, Circle/Arc and other paid/partner services. | Obtain provider-specific confirmations or define tested buyer re-provision/re-contract paths. |
| AR-05 | MEDIUM | Closing-commit SBOM/licence scan is not retained by this audit. | Generate at candidate SHA, review exceptions and retain report. |
| AR-06 | MEDIUM | Domain/brand ownership evidence is outside repository. | Add registrar/brand ownership and assignment evidence to data room. |
| AR-07 | MEDIUM | UCDP Dyadic current adapter and sanctions evidence are not commercially cleared in the engineering register. | Keep excluded/fail-closed or complete source-specific review before including them in paid/transfer claims. |
| AR-08 | LOW | Current hosting requires a one-way canonical-to-Lovable mirror and explicit publish action. | Either transfer/recreate Lovable setup and mirror token or migrate buyer hosting; validate from canonical source. |

## 10. Pass definitions

### TRANSFERABILITY PASS

May be marked only when AR-01, AR-02 and all material provider/asset-rights blockers are closed, the exact assets/exclusions are scheduled, and counsel has reviewed the transaction-specific IP/assignment position. Engineering evidence alone cannot self-certify legal title.

### FOUNDER-INDEPENDENCE PASS

May be marked only after an independent tester completes the clean-room test and founder-removal simulation using buyer/tester-controlled identities, with no undocumented founder dependency and with retained evidence.

### Current status

- **Technical architecture suitable for handover:** YES, based on repository controls and runbooks.
- **Acquisition-ready clean legal title:** NOT YET EVIDENCED.
- **Founder-independent operation:** TESTABLE, NOT YET PROVEN.
- **Safe to market as `ready-to-transfer with defined closing gates`:** YES.
- **Safe to claim `fully transferable / founder-independent / legally cleared`:** NO, until the gates above pass.

## 11. Buyer-facing wording after current audit

Until all gates close, use:

> Geomacro is engineered for transfer: the canonical source, database contract, deployment controls, source-rights gates, signing lifecycle and operational runbooks are documented. A formal acquisition handover process is defined. Final legal-title, provider-transfer and independent founder-removal acceptance gates must be completed as part of diligence/closing.

After both formal gates pass, replace this with an evidence-backed statement that names the exact tested commit/date and limitations.
