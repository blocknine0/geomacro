# Step3 Shadow 404 — deployed entrypoint and static assets read-only differential audit

## Physically reproduced

On 2026-11-09, both the modern and legacy Shadow Workers returned `404 text/plain;charset=UTF-8` for (a) the intentionally retired `/v1/public/intelligence-publications` and (b) `/v1/internal/p0b/status?deep=invalid` with invalid bearer.

The owner's `wrangler tail geomacro-step3-shadow --format pretty` recorded the corresponding GET invocation as `Ok`. This shows an invocation event for the exact Worker, **not** proof of 200 or code-path parity. `server: cloudflare` and Ray `a57ace595a0adc57-BOM` were observed on the HTTP 404.

Canonical source `workers/control-plane/src/index.mjs` instead returns a JSON 404 for the retired route and, with a configured `CONTROL_PLANE_TOKEN`, a JSON 401 `UNAUTHORIZED` for an incorrect bearer on P0B. Without a token it would return JSON 503. Thus neither real HTTP response is the expected canonical JSON.

Two earlier live physical audits:
- [#42570415092](https://github.com/blocknine0/geomacro/actions/runs/42570415092)
- [#42572115190](https://github.com/blocknine0/geomacro/actions/runs/42572115190)

confirm both script hostnames enabled and 100%-deployed versions with `fetch` handlers. The version content endpoint shows route text, **not** an immutable main-module binary equivalence proof. Legacy's unique provider Version URL also yielded HTTP 404; modern's Version URL did not match the strict provider allowlist.

## Decisive metadata added

Extend the existing `step3-shadow-live-code-version-audit.yml` (read-only, protected main) to capture these fields from the exact immutable **version-specific** Cloudflare API record:

- `main_module` — allowlisted inert filename, else `UNVERIFIED`; not a code parity certificate
- `assets.config.run_worker_first` — validated boolean or small allowlisted route-pattern array, else `UNVERIFIED`
- `assets.config.not_found_handling`, `html_handling` — allowlisted configurations only
- `assets.config` presence, `compatibility_date` — no secrets
- deployed version's legacy `fetch` handler and presence of an `ASSETS` binding

**Never persist `assets.jwt`, binding values, downloaded source, response text, cookie, bearer or JWK.** If the version API is denied, metadata must say UNKNOWN; do not infer assets disabled. No Cloudflare configuration mutation is made by the audit.

Official source: https://developers.cloudflare.com/workers/static-assets/ and https://developers.cloudflare.com/workers/wrangler/configuration/ . Cloudflare assets routing may serve a text/plain 404 for a non-matching asset, but the symptom alone is not proof of this configuration.

## Permanent recovery criteria

1. Diagnose the isolated Workers' immutable `main_module` and assets configuration; inspect actual bundle entrypoint if metadata is ambiguous.
2. Stage a Shadow-only candidate that retains its **existing Shadow D1, R2, secret, schedule and other bindings**. No production binding, no new payment or partner scopes, no signature/key rotation.
3. Prove candidate returns JSON 404 on retired public route; JSON 401 on intentionally bad bearer; and JSON 400 `P0B_STATUS_QUERY_INVALID` on authenticated invalid admin query, without D1 usage.
4. Require both isolated modern/legacy Workers' physical response, plus B2 readback/Shadow D1 ACK, encrypted R2 checkpoint, migration and independent exact-main quota/headroom before any production canary promotion.
5. Keep `config/d1-hotspot-v2-canary.hold` active throughout investigation; there is no inferred safety bypass.

This change is an independent diagnostic, **not** an announcement that routing or canary was repaired.
