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
| Source registry | `apply-risk-stream-source-registry.yml` is manual `workflow_dispatch`, with preflight/apply and headroom/identity gates. The checked-in reviewed-rights manifest currently has 3 `APPROVED` entries (UK FCDO, OBR, DBT) and 3 `PENDING` examples. | The manifest does not establish all-country/three-category commercial source coverage. Registry seeding must be completed and verified before rights attestation can pass for additional sources. |

The Risk Stream consumer can accept `POST /v1/internal/risk-stream/events`; it validates original-source proofs, source registry rights, category role pairs and D1 readback before persisting a signed GRO. Commercial license work is queued only when both `GEOMACRO_COMMERCIAL_STREAM_RELEASE=1` and `RISK_STREAM_CANARY_HOLD_CLEARED=1`. The scheduled issuer then also requires the `GEOMACRO_RELEASE_REVIEWER` service, independent reviewer signature, current source rights, customer entitlement and a valid release receipt.

## Attesters and reviewer

The Control Plane config contains facts and rights service bindings, and the bridge requires `RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN` plus `RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN`. Before this change, those bearer values were not wired into the protected deploy/candidate environment, so an active stream could not authenticate to either attester. This PR adds them as exact reviewed additive secrets and requires valid values only when all four research activation flags are on. The canary runtime flags remain zero/off.

The facts and rights attester Worker source exists, but the rights attester's checked-in Wrangler D1 ID is a placeholder and there is no repository deployment workflow for either attester. The deployment operator must bind the actual production D1 ID and deploy the two services before activating Risk Stream.

There is no `workers/risk-stream-release-reviewer` implementation in this repository. The Control Plane deploy path can attach a separately deployed reviewer service when `GEOMACRO_RELEASE_REVIEWER_SERVICE` is set, and parity checks reject unreviewed service bindings. The service name alone is not an approval: the independent reviewer must implement the documented signed `geomacro.commercial-review-result.v1` contract and its public key must match `GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64`. Do not point the binding at an attester or Control Plane Worker.

## Exact post-canary sequence

Run this only after the current canary has completed and a separately reviewed release decision authorizes the transition. Use the actual production D1 UUID from Cloudflare. The values under `~/.geomacro-keys/` are private credentials; never print them or add them to Git.

1. Deploy the facts and rights services after replacing the rights config's D1 placeholder in a temporary copy with the verified production D1 UUID. Set service secrets before deployment:

   ```bash
   npx wrangler@4.136.3 secret put FACTS_ATTESTER_PKCS8_B64 --name geomacro-risk-stream-facts-attester < ~/.geomacro-keys/facts.pkcs8.b64
   npx wrangler@4.136.3 secret put FACTS_ATTESTER_BEARER_TOKEN --name geomacro-risk-stream-facts-attester < ~/.geomacro-keys/facts.bearer.txt
   npx wrangler@4.136.3 deploy --config workers/risk-stream-facts-attester/wrangler.jsonc
   npx wrangler@4.136.3 secret put RIGHTS_ATTESTER_PKCS8_B64 --name geomacro-risk-stream-rights-attester < ~/.geomacro-keys/rights.pkcs8.b64
   npx wrangler@4.136.3 secret put RIGHTS_ATTESTER_BEARER_TOKEN --name geomacro-risk-stream-rights-attester < ~/.geomacro-keys/rights.bearer.txt
   npx wrangler@4.136.3 deploy --config workers/risk-stream-rights-attester/wrangler.jsonc
   ```

   The rights Worker deploy command is blocked until `database_id` is replaced by the verified production UUID in a temporary deploy config. Confirm that the facts and rights keypairs are distinct and that their SPKI values match the public keys installed in the Control Plane.

2. Store the two bearer values as protected `production` GitHub secrets so the Control Plane can call the deployed services:

   ```bash
   gh secret set RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN -R blocknine0/geomacro -e production < ~/.geomacro-keys/facts.bearer.txt
   gh secret set RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN -R blocknine0/geomacro -e production < ~/.geomacro-keys/rights.bearer.txt
   ```

3. Run `apply-risk-stream-source-registry.yml` in `preflight`, inspect the receipt, and only then run `apply` with `APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION`. It applies only entries currently `APPROVED` in the reviewed rights manifest. Add no source until its rights and role are actually verified.

4. Deploy the separately reviewed release-reviewer service and verify its contract and independent Ed25519 key. This repository currently has no deploy command for that service; do not activate commercial flags until the service implementation and signed review contract are available.

5. After the canary, source seeding, attester, reviewer, migrations 0217/0220, source freshness, dual-attested GRO, seven-day history, customer entitlement and signed release receipt all pass, use the normal protected Control Plane deployment workflow. Set the protected production vars only in that reviewed release: research flags to `1`/`true`/`PRODUCTION`, `GEOMACRO_COMMERCIAL_STREAM_RELEASE=1`, `RISK_STREAM_CANARY_HOLD_CLEARED=1`, and set `RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED=1` only after the seven-day archive proof. Paid Predge traffic remains separately gated by Clause 5 go-live confirmation and `PREDGE_PAID_GO_LIVE_CROSSCHECK=PASS`; Store checkout remains off.

6. Verify all 150 Hot 50 cells and each of the three categories from provider D1 receipts, not workflow schedules. Then submit one separately authorized paid request per tier with a unique request/market/condition ID and a single end-buyer ID. Require HTTP 200, `entry_status=DELIVERED`, `billable=true`, the matching tier and price, `decision_signed_payload` Ed25519 verification, commercial license/GRO provenance verification, and one immutable `predge_paid_risk_gate_usage_ledger` row per verdict. A 409 or any missing source/category/receipt is a HOLD; do not send the Clause 5 email on the strength of this repository audit.

## Guardrails

- `config/d1-hotspot-v2-canary.hold` remains untouched.
- Telegram public scraping and `telegram_mtproto_flash` remain disabled.
- Paid/Store defaults remain off; no payment, release flag, D1 apply, or production deploy is performed by this PR.
- Dual Ed25519 source attestation, independent release review, signed license verification, quota/headroom controls and single-end-buyer limits remain fail-closed.
- No Durable Objects are introduced, and public Risk Gate routes receive no additional D1 reads from this change.
