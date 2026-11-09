# Step3 isolated Shadow 404: provider version URL versus production workers.dev (2026-11-09)

## Real evidence

- [Automatic audit #42570415092](https://github.com/blocknine0/geomacro/actions/runs/42570415092) and [manual audit #42570649571](https://github.com/blocknine0/geomacro/actions/runs/42570649571) both failed with `SHADOW_DEPLOYED_HANDLER_OR_PUBLIC_INGRESS_NEEDS_RECONCILIATION`.
- Cloudflare reports both isolated scripts with `workers.dev enabled=true` and `previews_enabled=true`.
- The modern deployed Worker version ID is `48680b70-c41c-4af9-9e70-497213471dbb`; the legacy ID is `73437c7b-83b2-44df-bbc5-87be1df25a9b`.
- Both deployed version records report a `fetch` handler and Shadow D1 binding; the current content endpoint contains authentication, P0B and private-original symbols but is **not an immutable deployed-code certificate**.
- Both production `<script>.<account>.workers.dev` ingress URLs answer **HTTP 404 non-JSON**, not the canonical JSON 401 auth rejection.

The evidence excludes a disabled `workers.dev` flag as the sole cause; it does **not** yet prove whether Cloudflare routing, version deployment, account-level access or malformed provider DNS mapping causes 404. Repeatedly toggling an already enabled route or rotating credentials is not a fix.

## Bounded read-only diagnosis

Cloudflare documents per-Worker immutable Version URLs in the format `<version-prefix>-<worker>.<account>.workers.dev`. The modern API `GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}` returns `result.urls` containing routable URLs for a specific immutable version.

The existing `step3-shadow-live-code-version-audit.yml` now:
1. Confirms pinned account, production/Shadow D1 separation, existing HOLD and 100% deployed version.
2. Requests the exact version's `urls` using **GET only**. It never guesses a Version URL: it only accepts a single provider-returned exact `https://<8-hex-version-prefix>-<allowlisted-shadow-script>.daspallab202391.workers.dev`.
3. Sends a bounded **deliberately invalid bearer** probe to the immutable Version URL and separately to the production script hostname.
4. Redacts all HTTP bodies, headers except response-type classification, cookies, token, Worker source and private bindings. The artifact records immutable version ID, provider URL provenance, HTTP status and whether exact JSON 401 `UNAUTHORIZED` was received. A Cloudflare Access redirect/challenge, 403 or unavailable Version URL is UNKNOWN/HOLD, not PASS.
5. Preserves canary HOLD. A Version URL guard PASS plus production URL 404 is conclusive evidence of **production script-host routing mismatch**, not production Worker failure. If both URLs fail, inspect the account-level Cloudflare 404/error and access settings; do not deploy or promote without a checked recovery plan.

## Production release still gated

No D1 SQL, Worker route changes, secret writes, B2 original PUT, new funds, Predge change or canary promotion is authorized in this audit. The manual reconciliation and subsequent auth/B2 acceptance workflows remain blocked until a real Shadow ingress proves the API authentication boundary.

After CI and review, merging the PR to `main` automatically invokes read-only audit. Inspect its sanitized receipt; do **not** interpret a completed offline PR workflow as provider PASS.

Official references:
- https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/
- https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/get/
- https://developers.cloudflare.com/workers/observability/errors/
