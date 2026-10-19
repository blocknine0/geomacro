# Predge x Geomacro — ready-to-build driver handoff (19 October 2026)

**Compatibility:** GRO `gro-1.1` and advisory Risk Gate `risk-gate-1.0`.
**Scope:** private 90-day free pilot integration and real, unscored *public
research* observations. No new key, wallet, payment, source rights or production
authorization is granted by this pack.

## Live input to connect immediately

```bash
curl --fail-with-body --retry 2 --retry-delay 5 \
  'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h'
```

The `items[]` are derived from the **same 72-hour D1 journal as the Geomacro
Intelligence page**, retaining stable `id`, `category`, original
`original_published_at` and source-native `date_precision`.
Use `?domain=geopolitics`, `?domain=macro` or `?domain=rare_earth`;
`availability_by_category` reports all three regardless. Poll every 15–30
minutes and deduplicate on **item.id**, NOT solely on publication time.
Treat 200 + empty `items` as no observed qualified release and 503 as an
actual outage. Never add inferred score, direction, subject ISO3 or legal
eligibility to unclassified candidates. Records explicitly mark
`commercial_derived_rights_verified:false`, `signed_product_verified:false`,
`payable:false`, and no source-neutral redistribution rights.

## Two independent onboarding scopes — do not confuse their gates

**FREE RESEARCH (available now):** Public `GET /v1/public/derived-structural-72h`
needs no partner token, individual item approvals, reviewer receipts or signed
GRI. The optional authenticated Predge research route requires **one
dedicated 64-hex Bearer**, not repeat per-item approvals. The Geomacro
Worker's private anonymous 401 / authenticated 200 and matching D1 IDs were
independently verified on the 19 October 2026 protected main deploy.
**Predge's receipt of that token and its own successful call are not yet
independently confirmed.** A 200 with no eligible items is a valid empty
observation, not invented macro or minerals coverage.

Both free routes are **non-commercial, source-neutral research-only**. They
retain native clocks, original content-credit exclusions, the 15-minute
delay, 72-hour retention and existing 500/UTC-day authenticated hard cap.
They cannot authorize resale, source-rights elevation, scoring, payment or
trade execution.

**SIGNED MARKET / GRO / RISK GATE (separate, not yet accepted):** Requires
Predge's independently verifiable market signing key, signed numeric
`market_id` plus `condition_id`, exact clocks/condition/dispute state,
their own authorization and quota acceptance, and a genuinely current
verified `gro-1.1` if making a Risk Gate decision. Free public news
records are advisory candidate observations, not signed market state.

## Driver fields (actual implementation contracts)

A Risk Gate v1 request needs `request_id`,
`subject:{type:"country"|"corridor",id}`, and `policy`:
`policy_id`, `policy_version`, `continue_max_score`,
`reduce_limit_max_score`, `require_approval_max_score`,
`minimum_confidence_for_auto_continue`,
`require_commercial_verification_for_continue`. Optional
`max_positive_delta_for_auto_continue`, `hard_stop_driver_contributions`,
`action_context:{action_type,amount,currency,destination,metadata}`.

Response fields: `schema_version:risk-gate-1.0`, `request_id`,
`decision:CONTINUE|REDUCE_LIMIT|REQUIRE_APPROVAL|PAUSE`,
`recommended_action:ALLOW|REDUCE_EXPOSURE|REQUIRE_HUMAN_APPROVAL|BLOCK`,
`reason_codes[]`, `counterfactual`, `subject`, `risk`,
`top_drivers[]`, `policy`, and **`execution_authorized:false`**.
Even `CONTINUE` is *advisory*, never payment or trade permission.
For a Predge settlement-risk record require exact signed `market_id`
**numeric** and `condition_id` bindings, verify Ed25519 canonical UTF-8
signature and content hash from Predge's published key, enforce freshness,
and use signed `dispute_count`/`sent_to_uma_vote` where a `disputes[]`
array omits records. An unsigned slug is insufficient. Predge clean
cannot override a more restrictive Geomacro decision; absent actual verified
current GRO => fail closed `PAUSE` / human review.

## Included examples

* `gro-country-example.json` — old canonical country test-vector,
  **unsigned as a GRO**. NOT a verified current source observation.
* `gro-corridor-example.json` — synthetic corridor shape only,
  **unsigned** and INCOMPLETE.
* `risk-gate-request.json` — pilot-only request structure; example IDs
  and monetary context are synthetic.
* `risk-gate-response.json` — illustrative fail-closed advisory.
* `manifest.json` — machine-readable field and scope contract.
For real GRO delivery request an independently signed and unexpired
`gro-1.1` object with its `integrity`, `verification`, evidence and
rights flags unchanged. **Never relabel these fixtures as production signatures.**

## Before separately signed-market Risk Gate driver acceptance

Predge must confirm its **own** server-enforced market-feed quota, signing
key and credential header: suggested target 100 checks/day, HARD maximum
500/day. Those **Predge-market** credentials and counters are NOT
prerequisites for Geomacro's already deployed public free-research GET.
The authenticated Geomacro research feed instead requires only its own
dedicated Bearer, which the owner must share through a secure channel.
For the signed-market driver Predge must provide settlement-risk endpoint
specification, a current signing key, independent live PUBLIC_SANDBOX signed
sample and signed/countersigned LOI v2 where applicable to the separate
driver agreement. Geomacro verifies signature, clock, numeric ID, origin,
actual server counters and fail-closed responses. No fees, prepaid costs
or minimum commitments. A public research news feed alone is **not** an
agreement to redistribute structured intelligence commercially.
The first real-input feedback target is 2 November 2026, not evidence
that a signed-market driver test has already passed. Legacy Supabase
Risk Gate is not a deployed replacement; never claim paid production GO
before the independent signed-market and product proof gates pass.

Relevant canonical sources:
`schemas/gro-1.1.schema.json`, `src/lib/risk-gate-contract.ts`,
`src/lib/risk-gate-api.server.ts`,
`docs/ops/PREDGE_SHARED_72H_DERIVED_NEWS_FEED_20261019.md`.

## One-token automatic *private* research delivery (pilot-only)

After the protected D1 Worker deploy the authenticated route is:
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h`.
Use `Authorization: Bearer <dedicated-research-token>`. The dedicated token
is HMAC-derived *server-side only* from the existing production ledger secret,
under a different domain-separated label than the administration token.
**Never disclose** the root/admin secret to Predge. Share the single dedicated
token through an agreed secure partner channel; it is not returned in GitHub
Actions or this repository.

No partner-scope receipt, per-item rights-review receipt or individual item
ID allowlist is needed for **private non-commercial research evaluation**:
the feed automatically returns exactly the same up-to-600 **public-eligible**
72-hour derived item IDs as Geomacro Intelligence. Predge deduplicates by
`id` while polling, and sees source-native clocks and unclassified flags.
No new D1 table, B2 downloads, Supabase, payment or private-publisher scrape.

The pilot-only path never allows paid use, public or customer-facing resale,
unreviewed third-party material, credited items requiring visibly disclosed
publisher attribution, signed GRO or automated Risk Gate approval. Treat
the records as **driver candidates**, not Risk Gate decisions: Predge's
`risk-gate-1.0` still requires a separately verified current `gro-1.1`
and a policy evaluation. `execution_authorized=false` always.

Maximum provisional pilot expiry is **2027-01-17T00:00:00Z** (90 days
from proposed Oct 19 UTC kickoff). This does not assert a countersigned
LOI or give rights beyond the separately written pilot agreement; if
the actual agreed kickoff differs, reconfigure before any extension.

## Get ONLY the dedicated Predge research token securely

The protected Cloudflare deployment already derives the 64-char hex
`PREDGE_RESEARCH_NEWS_TOKEN` via
`HMAC-SHA256(GEOMACRO_COMMERCE_LEDGER_TOKEN,
"geomacro-predge-72h-research-only-v1")`.
It is a Worker secret and **cannot be read back** in plaintext from GitHub
Actions or Cloudflare. Do not share the root ledger or control-plane admin
secret with Predge.

If the owner no longer has the plaintext production root secret, use the
**manual, owner-initiated sealed handoff**:
`.github/workflows/predge-token-only-sealed-handoff.yml`. Generate a
temporary RSA 3072 private/public keypair LOCALLY, outside the repo.
Pass only the **base64 PUBLIC PEM** as the workflow input. The production
runner verifies anonymous=401 and authenticated research=200, encrypts the
dedicated research token using RSA-OAEP-SHA256 and the fixed
`geomacro.predge.research-token-handoff.v1` label, and publishes only
encrypted ciphertext as a 1-day GitHub Actions artifact. No plaintext
Bearer is in the logs or artifact. Decrypt the ciphertext on the owner's
computer with the private PEM; deliver the bearer via a private secure
partner channel (not a chat, GitHub issue, URL or public email).

PowerShell, from a private folder OUTSIDE the project (Node.js 22):

```powershell
node -e "const c=require('node:crypto'),f=require('node:fs'),k=c.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});f.writeFileSync('predge-owner-private.pem',k.privateKey,{mode:0o600});f.writeFileSync('predge-owner-public.pem',k.publicKey);console.log(Buffer.from(k.publicKey).toString('base64'))"
```

Copy the displayed BASE64 PUBLIC key (not the PEM private key). In GitHub:
Actions > "Predge Token-Only Encrypted Handoff (No Funds)" >
Run workflow (branch main) > paste public key > Run. Download
`predge-owner-research-token-encrypted-<run_id>` from that run and unzip
the ciphertext into the same private folder, then:

```powershell
node -e "const c=require('node:crypto'),f=require('node:fs');const t=c.privateDecrypt({key:f.readFileSync('predge-owner-private.pem'),padding:c.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256',oaepLabel:Buffer.from('geomacro.predge.research-token-handoff.v1')},f.readFileSync('predge-research-token.rsa-oaep-sha256.bin')).toString('utf8'); if(!/^[a-f0-9]{64}$/.test(t))throw Error('Invalid handoff');console.log(t)"
```

Keep plaintext hidden and hand off ONLY that 64-hex token to Predge.
They call:
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/derived-structural-72h`
with `Authorization: Bearer <token>` (no token in URL).
Predge gets the same public-eligible derived D1 items, not raw publisher
articles or signed paid GRO. The provisional research expiry is
2027-01-17T00:00:00Z and does **not** itself grant commercial redistribution.

## Reusing an already-issued Predge research Bearer (optional)

If Predge already generated an **independent, purpose-scoped research token**
that is exactly 64 lowercase hexadecimal characters, the founder may retain
that value rather than replacing it. Set it privately as the
`PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` **production environment secret** in
GitHub (not in chat, README, PR, an issue, or a workflow input), then deploy
the existing D1 control-plane workflow on protected main. The deploy rejects
invalid format and attempts to reuse Geomacro admin/root credentials, then
requires existing live 401/200 + shared 72-hour D1 ID parity acceptance.

The owner-only RSA-OAEP encrypted handoff workflow now uses the *same active
token source* as the deploy: optional protected override, otherwise original
separate domain HMAC. It verifies the actual live endpoint **before** sealing
the token. No root or token is printed or made publicly readable.

**Crucial distinction:** A token issued by Predge to call **Predge's own
settlement-risk API** does **not** automatically authorize Geomacro's research
endpoint and should not be reused across the two services. The existing
Predge-facing Geomacro token must be purpose-scoped explicitly for this
Geomacro feed. If the prior credential has a different opaque format, it
requires a separate validated integration and cannot be pasted into this
64-hex Worker contract. No automatic conversion, source-rights bypass or
public partner commercial grant.

To rotate or revoke an enrolled token, use a replacement 64-hex protected
secret and redeploy. **Deleting the override alone reactivates the preexisting
HMAC fallback**, which is not an effective revocation if that fallback has
previously been shared. Partner acknowledgments and actual 200 requests must
be verified independently; green CI alone does not prove recipient access.
