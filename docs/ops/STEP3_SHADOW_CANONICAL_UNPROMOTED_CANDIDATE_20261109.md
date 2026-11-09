# Step3 canonical Shadow entrypoint restoration: UNPROMOTED candidate only (2026-11-09)

## Physical root cause

- Modern and legacy Shadow script URLs return `404 text/plain` on retired public and private P0B endpoints.
- Modern `wrangler tail` records the exact GET as `Ok`, meaning an invocation occurred, not that HTTP succeeded.
- Live [run #42575968150](https://github.com/blocknine0/geomacro/actions/runs/42575968150) reports both deployed `main_module: shadow-entry.js`, compatibility date `2026-10-03`, no static assets configuration, no ASSETS binding, and the expected Shadow D1/secret bindings. Thus the public/admin 404 is an entrypoint/runtime-code mismatch relative to `workers/control-plane/src/index.mjs`, not a diagnosed static assets route problem.
- The canonical API source returns JSON 404 on retired public route, JSON 401 on invalid admin bearer (if token configured) and JSON 400 `P0B_STATUS_QUERY_INVALID` after valid admin bearer with `deep=invalid`.

## First recovery action: create immutable Shadow versions, without promotion

`step3-shadow-canonical-candidate-upload.yml` is **manually dispatched only** after required checks/review, exact main SHA, Cloudflare account identity, existing protected canary HOLD and owner approval string:

`STAGE_TWO_ISOLATED_SHADOW_CANONICAL_VERSIONS_NO_TRAFFIC`

This performs, sequentially:

1. Verify both isolated old versions are the sole 100%-deployed versions on their script names; inspect each Cloudflare deployed version, D1 resource IDs and all effective binding names/types.
2. Require the most recently **uploaded** version ID to equal the current single 100%-**deployed** version ID for each script before any inheritance. Cloudflare `inherit` can resolve from the latest uploaded version rather than the deployed version; if they differ, HOLD without uploading. Refuse **any** production D1 binding. Require the exact Shadow DB `c4add153-229d-412a-b1bd-489526b7e02f`, existing `CONTROL_PLANE_TOKEN` secret and, for modern Shadow, the private `PHASE2H_PRIVATE_R2=geomacro-step3-shadow-private` bucket. Do not export secret values.
3. Build `src/index.mjs` with the existing deployed version's compatibility date/flags and all existing bindings through `unsafe.bindings: [{name,type:"inherit"}]`. Pin `GEOMACRO_SOURCE_SHA` to the exact checked-out main revision.
4. Run **only `wrangler versions upload`** for both *isolated Shadow* script names; no `wrangler deploy`, `versions deploy`, SQL, B2 PUT or client traffic move. Read back the candidate's immutable version ID, binding/resource/value parity, runtime parity and confirm the original deployed 100% version remains unchanged.
5. Preserve redacted per-script candidate IDs and status in `artifacts/release/step3-shadow-canonical-unpromoted-candidates.json`.

The original production Worker and production DB are never targeted.

This candidate receipt is not proof that Worker HTTP APIs function; it must not lift `config/d1-hotspot-v2-canary.hold`.

## Next physical acceptance, separate from candidate upload

- Get exact candidate version URL only from the Cloudflare version-specific provider API. A 404, missing URL or wrong API entrypoint is HOLD.
- For each Shadow candidate, prove retired public route returns JSON 404, invalid root bearer returns JSON 401, and valid bearer (secure owner credential) with `deep=invalid` returns JSON 400 `P0B_STATUS_QUERY_INVALID`, without D1 reads.
- Only after both verified: a **separate** owner-approved Shadow-only deployment/promotion with readback and rollback/version pinning is needed; never promote production.
- Then run existing bearer sync, genuine original B2 archive PUT+two GET/parity, Shadow D1 ACK, encrypted R2 checkpoint, migration and protected canary Stage 4 under quota/signer proof. Current payments and Predge contracts stay unchanged.

The GitHub Actions workflow requires an explicit manual dispatch. Installing code, merging a PR, or staging immutable versions does not itself alter live Worker traffic and does not make the commercial Risk Gate production-ready.
