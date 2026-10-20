# GEOMACRO P0: Four signed-production blockers — executable recovery (20 October 2026)

Owner: \`blocknine0/geomacro\`. Canonical live: \`https://geomacro.live\`.
Frozen Supabase; no real-money acknowledgements, x402 settlement or paid API.
This guide defines actual **proof-gated steps**, not a claim that signed data exists.

## Verified starting point (do not overwrite these facts)

- Public site \`GET /api/health?deep=1\` returns **HTTP 503**.
- Authenticated control-plane D1 responds 200/schema 5. Its \`intelligence\`, \`global-risk\`, and \`risk-indices\` CURRENT hot endpoints return 503 \`HOT_SNAPSHOT_STALE_OR_INVALID\`. D1 source timestamps are stale/expired.
- PR #2548 -> Actions run [39428694617](https://github.com/blocknine0/geomacro/actions/runs/39428694617) **genuinely** verified one October 8 immutable historical GRI B2 version, exact compressed SHA and gzip/payload. This is an old baseline only, not independently reviewed current numerical GRI or full multi-snapshot lineage.
- Reviewed GRI SHA, country-certificates SHA, reviewer approval timestamp, dual-signed Intelligence SHA and approval timestamp were empty in production readiness. Do not fill them with synthetic or historical hashes.
- Last three-domain source pulse read all source categories but found **zero NEW qualifying original article fingerprints** and one pending review; historical/catalog feed timestamps are not original event clocks.
- PR #2547 created an owner-private, real signed machine Intelligence staging path. PR #2549 repaired the automatic website-health follow-up after successful signed publication, including main-SHA race; it does not deploy the public website for you.

## Dependency graph and acceptable meaning of 200

\`\`\`text
Real source-native originals + lawful article-specific derived-use clearance
                     |
        distinct private Facts and Rights approvals
                     |
    EXACT protected 3-domain dual-signed Intelligence batch
                     |
         private staging -> pinned B2 -> reverify
                     |
        current Intelligence published to D1 and public GET 200
                     |
              [separate branch]
Oct 8 actual original historical B2 version (already GET+SHA verified)
  + new source-native evidence after that history
  + independent reviewer-signed numerical GRI batch
  + separately signed country/category CERTIFIED certificates
                     |
     offline GRI preflight + canonical score/review/signature checks
                     |
     private immutable B2 stage -> protected GRI publisher -> D1 GET 200
                     |
        verified current GRI parent -> Risk Indices publisher
                     |
     actual risk-indices B2 gzip/hash/D1/current public GET 200
                     |
    canonical website SHA/mirror parity + /api/health?deep=1 HTTP 200
\`\`\`

No historical snapshot can be redated, no two independent originating publishers can be replaced by copies from one organization, and no signed source-rights proof can be invented from an accessible news URL. A real HTTP 200 requires live proof, not changing the health response code.

## Gate 0. Prepare a protected private workstation

Keep existing, distinct Facts and Rights Ed25519 **private** keys on their own machines; reviewer private key with its real independent reviewer, and GRO signer separate. **Never give private PEMs, rights documents, original HTML or signed private JSON to this chat or GitHub build artifacts.** No need to generate or rotate keys if valid approved keys already exist.

Work from a current checkout of \`blocknine0/geomacro\`. Use existing pinned public keys and the existing \`GEOMACRO_PRIVATE_REVIEW_DIR\` source/rights evidence policy. Create a private directory **outside** the repository, accessible only to the custodian. On Linux/macOS enforce directories 0700 and files 0600; on Windows use a separate protected local NTFS directory with inheritance disabled and only the custodian granted access. A network/shared directory or the repo checkout is inappropriate for private source/permission files.

In PowerShell:

\`\`\`powershell
cd C:\path\to\geomacro
git pull --ff-only
# Choose an existing private NTFS directory, NOT under the checkout.
$Private = 'C:\geomacro-owner-private'
# Protect this directory's NTFS ACL BEFORE placing any private source files.
# The exact reviewer/issuer PEM keys remain with their existing custodians.
\`\`\`

## Gate 1. Restore a usable ORIGINAL historical B2 gzip on the owner-private machine

This is now an explicit separately reviewed export, not an Actions artifact.

The protected [historical B2 recovery](https://github.com/blocknine0/geomacro/actions/runs/39428694617) proved one exact file-version exists. But GitHub's safely scrubbed receipt deliberately does **not** include the compressed raw bytes needed by the private offline current GRI scorer.

Use \`scripts/ops/export-gri-verified-history-private.mjs\` on the real owner-private machine ONLY. It calls the existing \`recoverPinnedGriVersion\` with its pre-existing authoritative D1 anchor and shared D1 B2 quota governor. It performs exact selected file-version GET and independently verifies the compressed SHA, gzip/payload SHA, schema and original dates again. It refuses GitHub Actions/CI, repo outputs, unprotected directories and overwrites. No B2 PUT, D1 hot promotion or new score. It cannot run if quota is held; retry only after real shared headroom is available, no quota bypass.

Set **pre-existing** scoped \`B2_KEY_ID\`, \`B2_APPLICATION_KEY\`, \`CLOUDFLARE_ACCOUNT_ID\`, \`CLOUDFLARE_API_TOKEN\`, \`D1_DATABASE_ID\` and \`GEOMACRO_COMMERCE_LEDGER_TOKEN\` on that protected machine. Never paste their values into logs/chats. In PowerShell, using an already access-controlled local destination:

\`\`\`powershell
$env:B2_ACCOUNT_QUOTA_REQUIRED = '1'
$env:B2_ACCOUNT_QUOTA_WORKFLOW_ID = 'historical_gri_version_recovery'
$env:B2_REQUEST_BUDGET = '4'
$env:GEOMACRO_PRIVATE_HISTORICAL_EXPORT_ACK = 'YES_NO_FUNDS'
$env:GEOMACRO_HISTORICAL_B2_READBACK_PATH = 'C:\geomacro-owner-private\historical-original-20261008.json.gz'
node scripts/ops/export-gri-verified-history-private.mjs --owner-private-verified-no-funds
if ($LASTEXITCODE -ne 0) { throw 'Private historical B2 export was NOT verified' }
$env:GEOMACRO_HISTORICAL_B2_READBACK_SHA256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $env:GEOMACRO_HISTORICAL_B2_READBACK_PATH).Hash.ToLowerInvariant()
\`\`\`

Use a **new output filename** per separate verified export: no overwrite. A successful safe receipt must have \`immutable_file_version_verified=true\`, \`owner_private_bytes_written=true\` and compressed SHA matching the official D1 historical anchor. It also correctly reports \`independently_reviewed_current_gri_verified=false\`. This original historical gzip is a lineage INPUT only.

## Gate 2. Fresh signed Intelligence

### 2A. Acquire actually new qualifying event originals

Use the existing \`Auto Ingest News\`, \`Three-Domain 30-Minute Original Publisher Pulse\` and original-source discovery as **candidate discovery**, not proof. For the current machine-Intelligence contract, prepare 3–12 actually distinct events **covering geopolitics, macro and rare_earth**; each requires 2–4 independently originated SAME-EVENT first-party HTML responses, exact byte SHA, verified source-native publication and occurrence clock, same-event binding, retraction/counterevidence review and current-country/category match. A historical World Bank release, feed fetch time or catalog edition is not a new event. Do not classify one generic article as three unrelated categories. **If no fresh qualifying event exists, the correct outcome is NO_CURRENT_SIGNED_INPUT.**

### 2B. Establish rights BEFORE signing

Existing \`docs/ops/ZERO_COST_OFFLINE_MACHINE_ISSUER.md\` is the authority. For each article, the separate rights custodian checks the exact scope, body-byte SHA, no-attribution commercial-derived-use grant or genuinely applicable public-domain status, and all third-party exclusions; where attribution is legally mandated, this existing *no-attribution signed profile* cannot be claimed without changing its customer licence/credit design explicitly and separately. A generic official URL or source registration is not a legal permission record.

Facts custodian independently signs the exact native-clocks/evidence package; Rights custodian signs the matching proof and genuine legal scope using the pre-existing distinct approved Ed25519 keys (offline). The separate third GRO signer is not Facts or Rights.

### 2C. Assemble, validate, stage, dispatch

\`\`\`bash
# Example only; use your genuinely qualified 0600 input in the private directory.
node scripts/ops/issue-offline-machine-commercial-proof.mjs --mode=issue --role=facts --input=facts-submission.json --out=facts-attestation.json
# Run rights issuance SEPARATELY on the rights custodian machine with its real approvals.
node scripts/ops/issue-offline-machine-commercial-proof.mjs --mode=issue --role=rights --input=rights-submission.json --out=rights-attestation.json
node scripts/ops/issue-offline-machine-commercial-proof.mjs --mode=assemble --input=assembly.json --out=private-request.json

bun scripts/ops/prepare-machine-intelligence-publication.ts --input=/secure/geomacro-private/current-machine-batch.json --out=/secure/geomacro-private/current-machine-intelligence.json
\`\`\`

Use the existing real input format in \`docs/ops/machine-intelligence-publication.md\`, including the real pre-existing evidence/right registry and public-key SHA pins. Set \`GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT\`, its independently computed \`GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256\`, the B2/D1 governor and separate public Facts/Rights/GRO keys. Then:

\`\`\`bash
B2_ACCOUNT_QUOTA_REQUIRED=1 \
B2_ACCOUNT_QUOTA_WORKFLOW_ID=machine_intelligence_signed_staging \
B2_REQUEST_BUDGET=6 \
bun scripts/ops/stage-approved-machine-intelligence-b2.mjs --stage-dual-signed-no-funds
\`\`\`

Optional direct dispatch **only after approved exact B2 readback**: \`MACHINE_SIGNED_READY_DISPATCH_ACK=YES_NO_FUNDS\` and an owner-custodied scoped GitHub token; the script sends the existing \`machine_intelligence_dual_signed_ready\` event containing B2 key and SHA only. Otherwise manually invoke [Machine Dual-Authority Intelligence Publication](https://github.com/blocknine0/geomacro/actions/workflows/intelligence-machine-current.yml) with exact pinned key and SHA. **Dispatch accepted is not publication accepted.**

**Gate 2 acceptance:** protected Actions publisher success, actual B2 gzip+SHA proof, fresh three-domain customer-row source times, independent Facts/Rights signatures, original rights, D1 readback, real unauthenticated \`/v1/public/hot-snapshot/intelligence\` HTTP 200 with valid current proof. Never infer this from upstream news workflow success.

## Gate 3. GRI v1.2: reviewer-signed scoring and certificates

Keep GRI an independently reviewed *numerical* product, not an arbitrary score generated from free article text. Use \`docs/ops/GRI_V12_APPROVED_REVIEW_IMMUTABLE_B2_STAGING.md\`.

The approved independent reviewer must provide, outside GitHub:
1. A genuinely NEW native-dated, independently corroborated source event newer than the verified October 8 historical source, with proper legal scope; three-domain source portfolio, counterevidence/retractions and canonical events.
2. An actual independent-reviewer Ed25519 signature on the exact \`GEOMACRO_REVIEWED_GRI\` payload; source-native dates and reviewed times must be recent enough for the canonical 90-minute verified publisher profile. Preserve exact signed JSON.
3. Distinct separately signed \`GEOMACRO_COUNTRY_CERTIFICATES\` for the involved country/category cells under the existing CERTIFIED contract. A country registry of 195 entries is NOT 195 actual current signed certificates.
4. The private exact historical \`*.json.gz\` bytes obtained in Gate 1 and their independent SHA.
5. Approved reviewer PUBLIC key/approved pin. Never use the GRO private signer as the independent reviewer.

Set \`GEOMACRO_REVIEWED_INTELLIGENCE_PATH/SHA256\`, \`GEOMACRO_REVIEWED_GRI_PATH/SHA256\`, \`GEOMACRO_COUNTRY_CERTIFICATES_PATH/SHA256\`, \`GEOMACRO_HISTORICAL_B2_READBACK_PATH/SHA256\`, \`GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM\` and its approved public-key pin.

\`\`\`bash
# Offline: NO B2, D1, Supabase or Coinbase credentials in this process.
bun scripts/ops/verify-three-domain-reviewed-handoff.mjs --prepare-immutable-b2

# Separately on authorized owner-private B2/D1 workstation:
# Set B2_ACCOUNT_QUOTA_REQUIRED=1
# Set B2_ACCOUNT_QUOTA_WORKFLOW_ID=gri_signed_input_staging
# Set B2_REQUEST_BUDGET=6
bun scripts/ops/stage-approved-reviewed-gri-private-b2.mjs --stage-approved-review-no-funds
\`\`\`

Stage re-checks reviewer/certificate signatures, source clocks and rights, actual historical gzip/score, immutable exact B2 upload/readback and original source after history. Optional \`GRI_SIGNED_READY_DISPATCH_ACK=YES_NO_FUNDS\` posts the existing \`gri_reviewed_current_ready\` event *only after genuine approved staging*. The publisher [GRI v1.2 Supabase-Free Current Promotion](https://github.com/blocknine0/geomacro/actions/workflows/gri-v12-supabase-free-reviewed-current.yml) independently revalidates review, signatures, scoring and D1. A green staging receipt alone is never an actual public GRI score.

**Gate 3 acceptance:** protected publisher successfully published a real NEW v1.2 numerical GRI and B2 verified current D1 global-risk public GET 200; certified country/category inputs and all required original/rights/signer checks preserved; no fake 195-country certification.

## Gate 4. Risk Indices + independent site acceptance

[Risk Indices from Verified D1 Global Risk](https://github.com/blocknine0/geomacro/actions/workflows/risk-indices-verified-d1-parent.yml) already follows a **successful** protected GRI publisher. Its trusted ancestor gate accepts a publisher that finished after main advanced, but the Risk Indices scorer/publisher must independently verify fresh numerical GRI source clocks and true signed parent B2/D1 readback. No independent paid API, no new unverified scoring. Avoid manual Risk Indices dispatch *before* current GRI has succeeded; it would safely fail.

Only after Intelligence, GRI and Risk Indices have truly promoted live signed B2/D1 data, verify **public HTTP** from outside production:

\`\`\`powershell
curl.exe -i 'https://geomacro-control-plane.daspallab202391.workers.dev/health'
curl.exe -i 'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/intelligence'
curl.exe -i 'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/global-risk'
curl.exe -i 'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/risk-indices'
curl.exe -i 'https://geomacro.live/.well-known/geomacro-build.json'
curl.exe -i 'https://geomacro.live/api/health?deep=1'
\`\`\`

- Each three public hot GETs must be real HTTP 200, no \`HOT_SNAPSHOT_STALE_OR_INVALID\`; verify proof schema, real source_as_of/expiry, B2 hash and D1 payload readback, not just HTTP status.
- \`geomacro.live/.well-known/geomacro-build.json\` must match current canonical **40-character SHA** and real Lovable deployed/source parity. \`Sync Canonical Main to Lovable\` passing does **not** publish Lovable; user must actually publish the built website if needed. Do not confuse read-only web candidate with live site.
- Run [Production Website Health](https://github.com/blocknine0/geomacro/actions/workflows/production-website-health.yml) on exact production after publisher events. It genuinely checks deep health, independent edges, source clocks and x402 no-funds safe boundaries. Its red result is a valid failure until the site is actually deployed and three current hot products are current.
- Health may and should return **503** on legitimately stale products. A zero-cost global network cannot guarantee an independent, rights-approved fresh geopolitical + macro + rare-earth event during every expiry window. The PERMANENT fix is a well-governed automatic discovery/review/staging/expiry loop, **not** permanently returning 200 without new evidence.
- Commercial x402 payment and 195-country current evidence are separate formal acceptance gates. Keep launch ACK/payment OFF pending actual tested settlement authorization.

## Owner/authority handoffs that software cannot forge

| Dependency | Responsible party | Safe artifact/action | Existing validator |
| --- | --- | --- | --- |
| Genuine two-origin event HTML/native clock | Source/research operator | Original private byte hashes and fresh provenance | Original source binding + live reread |
| Article-by-article commercial derived-use permission | Distinct rights authority | Exact original/licence SHA and scoped approval | Existing rights registry + offline issuer |
| Facts decision | Facts custodian | Actual Ed25519 facts signature | Machine commercial qualifier |
| Rights decision | Rights custodian | Actual *different* Ed25519 rights signature | Machine commercial qualifier |
| Current numerical GRI approval | Independent GRI reviewer | Actual reviewed signed v1.2 current batch | Canonical reviewed preflight/scorer |
| Country/category certificates | Separate certified authority | Actual signed country cells for involved subjects | Three-domain reviewer handoff |
| B2/Cloudflare authorized quotas | Existing environment owner | Existing scoped B2/D1 credentials and governed attempt budget | Shared D1 B2 governor |
| Actual website activation | Lovable deployment owner | Live build/mirror SHA parity | Production Website Health |

**Never hand private PEMs or raw source evidence to ChatGPT.** Owner-operated files, SHA pointers and existing source-specific lawful permissions are necessary real-world inputs. These are intentionally not provided by public GitHub. No workflow, synthetic fixture or agent can replace actual independent review/rights evidence.

## Exact completion criteria

All four boxes require **simultaneous**, independently observed facts:

- [ ] Current, genuinely rights-qualified, dual-signed Intelligence in exact B2 and public D1 with current original-source clocks.
- [ ] New genuinely independently reviewed, certified numerical GRI v1.2 in exact B2 and public D1, using real historical lineage.
- [ ] New Risk Indices computed from that CURRENT signed GRI parent with own exact B2/D1/published readback.
- [ ] Current deployed canonical website SHA + three live public GET 200 + actual \`GET /api/health?deep=1\` HTTP 200, no money touched.

Until then, keep P0 issues #2046/#2124/#1827 open. Never claim that approved private keys or signatures exist merely because an authorized owner wants them to.
