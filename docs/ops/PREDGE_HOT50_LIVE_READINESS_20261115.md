# Predge Hot 50 paid-flow audit — 2026-11-15

## Production status

This is a repository/configuration audit, not a live-provider acceptance receipt. The current production canary must finish before any production variables, secrets, Worker deployments, registry apply, or paid traffic flags are changed. Do not infer fresh source rows, signed GROs, licenses, or billable requests from scheduled workflow definitions or offline tests.

The following gates remain default-off in `wrangler.example.jsonc`: `RISK_STREAM_ACTIVE`, `STREAM_INGESTION_ENABLED`, `STREAM_MODE`, `RISK_STREAM_HOT50_AUTONOMOUS_ENABLED`, `GEOMACRO_COMMERCIAL_STREAM_RELEASE`, `RISK_STREAM_CANARY_HOLD_CLEARED`, and `RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED`. This is intentional and preserves the current canary/no-funds contract.

## Source-to-risk-stream findings

| Source path | Current repository behavior | Commercial Risk Stream status |
| --- | --- | --- |
| Telegram | The production entrypoint forces `TELEGRAM_ENABLED=false`; the authenticated bot webhook relay accepts only items matching the Hot 50 watch filter. The private Telegram worker stores only governed watch leads. Telegram remains a trigger and never becomes a verified original by itself. | No Telegram-to-original-evidence path. Independent first-party corroboration and dual attestation are still required. |
| Direct RSS / official feeds | `hot50-direct-original-news-20m.yml` and `rss-private-d1-15m.yml` run scheduled ingestion/probe lanes. The RSS workflow also explicitly sets Telegram off. | These workflows do not call `/v1/internal/risk-stream/events`; scheduled execution alone does not populate `risk_stream_evidence`. |
| Private OSINT | `private-global-osint-15m.yml` and `derived-risk-gate-discovery-20m.yml` feed the private/discovery lanes. | No verified-original event handoff from those workflow scripts into the Risk Stream queue was found. Index/discovery records cannot become commercial evidence. |
| Render unified ingestor | Sends normalized batches to `/v1/internal/unified-events` and the bounded archive endpoints. | This is a separate unified-event lane; it does not enqueue Risk Stream events. |
| Source registry | `apply-risk-stream-source-registry.yml` is manual `workflow_dispatch`, with preflight/apply and headroom/identity gates. The reviewed-rights manifest now contains 8 `APPROVED` first-party UK OGL entries and retains 3 `PENDING` examples. | These are UK sources only and do not establish all-country Hot 50 coverage or the independent source-role pairs required in every category. Registry apply and provider readback remain required. |

The Risk Stream consumer can accept `POST /v1/internal/risk-stream/events`; it validates original-source proofs, source registry rights, category role pairs and D1 readback before persisting a signed GRO. Commercial license work is queued only when both `GEOMACRO_COMMERCIAL_STREAM_RELEASE=1` and `RISK_STREAM_CANARY_HOLD_CLEARED=1`. The scheduled issuer then also requires the `GEOMACRO_RELEASE_REVIEWER` service, independent reviewer signature, current source rights, customer entitlement and a valid release receipt.

## Attesters and reviewer

The Control Plane config contains facts and rights service bindings, and the bridge requires `RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN` plus `RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN`. Before this change, those bearer values were not wired into the protected deploy/candidate environment, so an active stream could not authenticate to either attester. This PR adds them as exact reviewed additive secrets and requires valid values only when all four research activation flags are on. The canary runtime flags remain zero/off.

The rights attester now uses the supplied production D1 UUID `db057ca9-9f6e-4957-ac28-144f3b798f9b`. A manual production workflow deploys both attesters and the reviewer after checking keypairs. Do not run it while the production canary is active.

The new `workers/geomacro-release-reviewer` verifies the signed source GRO, current rights rows, exact category role pair, Predge subscription/receipt, independent reviewer keypair and protected release flags before signing. It stays held by default and refuses requests without an explicit derived score. **Current signed stream GROs do not contain `eligible_derived_score`**, so automatic license issuance remains held until the signed risk-score producer is wired and validated; this PR does not invent a score.

## Exact post-canary sequence

Run this only after the current canary has completed and a separately reviewed release decision authorizes the transition. Use the actual production D1 UUID from Cloudflare. The values under `~/.geomacro-keys/` are private credentials; never print them or add them to Git.

1. After the canary completes, run the manual workflow `Deploy Risk Stream Attesters and Release Reviewer` from `main` with production Cloudflare and attester keys provisioned. It deploys facts, rights, and reviewer Workers and validates each Ed25519 keypair. The rights configuration already pins the supplied production D1 UUID. The reviewer release/entitlement vars default to `0`; keep them off until a separate signed release decision is approved.

   ```bash
   npx wrangler@4.136.3 secret put FACTS_ATTESTER_PKCS8_B64 --name geomacro-risk-stream-facts-attester < ~/.geomacro-keys/facts.pkcs8.b64
   npx wrangler@4.136.3 secret put FACTS_ATTESTER_BEARER_TOKEN --name geomacro-risk-stream-facts-attester < ~/.geomacro-keys/facts.bearer.txt
   npx wrangler@4.136.3 deploy --config workers/risk-stream-facts-attester/wrangler.jsonc
   npx wrangler@4.136.3 secret put RIGHTS_ATTESTER_PKCS8_B64 --name geomacro-risk-stream-rights-attester < ~/.geomacro-keys/rights.pkcs8.b64
   npx wrangler@4.136.3 secret put RIGHTS_ATTESTER_BEARER_TOKEN --name geomacro-risk-stream-rights-attester < ~/.geomacro-keys/rights.bearer.txt
   npx wrangler@4.136.3 deploy --config workers/risk-stream-rights-attester/wrangler.jsonc
   ```

   The workflow also deploys the reviewer with the same independent private/public key pair and validates that the reviewer key differs from both the license and GRO keys. Confirm its service name is configured as the protected `GEOMACRO_RELEASE_REVIEWER_SERVICE` variable before the Control Plane deployment.

2. Store the two bearer values as protected `production` GitHub secrets so the Control Plane can call the deployed services:

   ```bash
   gh secret set RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN -R blocknine0/geomacro -e production < ~/.geomacro-keys/facts.bearer.txt
   gh secret set RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN -R blocknine0/geomacro -e production < ~/.geomacro-keys/rights.bearer.txt
   ```

3. Run `apply-risk-stream-source-registry.yml` in `preflight`, inspect the receipt, and only then run `apply` with `APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION`. It applies only entries currently `APPROVED` in the reviewed rights manifest. Add no source until its rights and role are actually verified.

4. Wire verified original observations from each direct/OSINT publisher into the existing `scripts/ops/emit-risk-stream-candidates.mjs` path only after each publisher has a current reviewed rights row and native timestamp. The current scheduled feed workflows and Render unified ingestor do not call `/v1/internal/risk-stream/events`; Telegram must remain a filtered trigger and must never become original evidence. No automatic source bridge or full 150-cell source qualification is claimed by this PR.

5. After the canary, source seeding, attester, reviewer, migrations 0217/0220, source freshness, dual-attested GRO, seven-day history, customer entitlement and signed release receipt all pass, use the normal protected Control Plane deployment workflow. Set the protected production vars only in that reviewed release: research flags to `1`/`true`/`PRODUCTION`, `GEOMACRO_COMMERCIAL_STREAM_RELEASE=1`, `RISK_STREAM_CANARY_HOLD_CLEARED=1`, and set `RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED=1` only after the seven-day archive proof. Paid Predge traffic remains separately gated by Clause 5 go-live confirmation and `PREDGE_PAID_GO_LIVE_CROSSCHECK=PASS`; Store checkout remains off.

6. The three-category paid endpoint E2E acceptance remains outstanding. Before any Clause 5 email, demonstrate real provider D1 receipts for all 150 cells, fresh original observations, valid role pairs and dual attestations, explicit scores, signed GROs, seven-day archive proof where required, reviewer-issued licenses, and `POST /v2/partner/predge/paid-risk-gate` returning `200`, `DELIVERED`, and `billable=true` with cryptographic verification and one immutable usage-ledger row per verdict. The current `rare_earth` free-source runtime has degraded source receipts (including denied/rate-limited readers); a status must not be marked healthy until fresh provider reads verify recovery.

## Guardrails

- `config/d1-hotspot-v2-canary.hold` remains untouched.
- Telegram public scraping and `telegram_mtproto_flash` remain disabled.
- Paid/Store defaults remain off; no payment, release flag, D1 apply, or production deploy is performed by this PR.
- Dual Ed25519 source attestation, independent release review, signed license verification, quota/headroom controls and single-end-buyer limits remain fail-closed.
- No Durable Objects are introduced, and public Risk Gate routes receive no additional D1 reads from this change.
