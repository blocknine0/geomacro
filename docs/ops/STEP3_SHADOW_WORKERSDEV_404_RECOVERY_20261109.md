# Step3: Shadow workers.dev HTTP 404 recovery (2026-11-09)

## Provider evidence (no inferred PASS)
Manual GitHub run [42567910020](https://github.com/blocknine0/geomacro/actions/runs/42567910020) returned:
`STEP3_BEARER_SHADOW_AUTH_PROBE_HTTP_404_NON_JSON`. The authenticated route did not reach a JSON response. This is NOT evidence that the bearer is wrong. The Cloudflare provider's actual script subdomain state has not yet been read in an approved production run.

Official Cloudflare script-route APIs:
- `GET /accounts/{account_id}/workers/scripts/{script_name}/subdomain`
- `POST /accounts/{account_id}/workers/scripts/{script_name}/subdomain` with `{"enabled":true,"previews_enabled":false}`

Cloudflare documents that a Worker can be deployed but its `workers.dev` ingress disabled, and that Wrangler configurations with `routes` can infer `workers_dev=false`.

## Permanent configuration and acceptance
Every future **isolated Shadow** Worker deployment must explicitly keep `workers_dev: true` when the host under `daspallab202391.workers.dev` is required, including deployments using additional routes. Never modify the canonical production Worker's route setting. A separate named, protected manual workflow `step3-shadow-workersdev-route-repair.yml` reconciles the provider state under an exact-main authorization. It checks both isolated script settings, production-vs-Shadow D1 ID separation, the existing admin bearer secret **binding name**, full deployed-version pinning, and Shadow R2 binding before any mutation.

After an exact-main PR merge, the owner may deliberately authorize only Shadow ingress:

```bash
gh workflow run step3-shadow-workersdev-route-repair.yml -R blocknine0/geomacro --ref main -f approval=ENABLE_ISOLATED_SHADOW_WORKERS_DEV_ONLY
```

The workflow changes a disabled Shadow script route only if all prechecks pass; existing enabled routes are left untouched. Cloudflare `enabled` and `previews_enabled` are independent booleans. The job **preserves the existing `previews_enabled` value**, rather than refusing an otherwise valid route or turning previews off outside the scope of this owner approval. The receipt records only those two nonsensitive flags and the scoped script name for diagnosis. It independently reads Cloudflare script subdomain state again and requires the actual Worker to reject an **unauthenticated** admin request with HTTP 401 + `{"ok":false,"error":"UNAUTHORIZED"}`. It does not assert the admin bearer matches yet; that proof remains the separately protected `step3-shadow-bearer-sync.yml` workflow. Any 404, non-JSON, error, permission denial, or unauthorized script binding retains HOLD and a redacted artifact.

The existing original/B2 ACK seed script now refuses governed Backblaze B2 writes if either Shadow script's provider subdomain is disabled. This avoids consuming B2 quota while the prerequisite ingress is missing.

## Live acceptance gotcha: independent preview flag

The first route-repair run [42568737575](https://github.com/blocknine0/geomacro/actions/runs/42568737575) returned `STEP3_SHADOW_ROUTE_SHADOW_SCRIPT_ROUTE_STATE_UNVERIFIED_OR_PREVIEW_ENABLED` without any confirmed route updates. Provider documentation returns independent `enabled` and `previews_enabled` fields, and an enabled preview is not proof of a disabled workers.dev ingress. The corrected job never changes preview configuration.

The governed original/B2 ACK seed now requires BOTH deployed Shadow Workers to answer the authenticated, deliberately-invalid admin query with HTTP 400 `P0B_STATUS_QUERY_INVALID` **before** source discovery or any B2 physical PUT. This prevents repeated B2 quota exhaustion if the ingress is still a 404 despite provider metadata being enabled.

## Sequence after acceptance
1. Review CI, CodeQL and the allowlisted changes; merge this PR to exact `main`.
2. Run the explicitly authorized Shadow route workflow and inspect the JSON receipt; require both workers route-live/401 from actual Worker.
3. Run `step3-shadow-bearer-sync.yml` with `SYNC_SHADOW_BEARERS_ONLY` and verify two authenticated Shadow Workers.
4. Run `step3-shadow-real-original-b2-ack.yml` with `SEED_REAL_SHADOW_B2_ACK_ONLY`; require real Shadow D1 ACK and B2 parity.
5. Perform the separately protected physical Stage1 rehearsal, production D1 migrations, rollback parity, Hot50 signed evidence, and staged canary. Keep `config/d1-hotspot-v2-canary.hold` until full 100% + 24h provider acceptance and a separate reviewed HOLD release.

No production D1 DDL, payment activation, Predge contract alteration, secret printing, or canary promotion is permitted in this workflow.
