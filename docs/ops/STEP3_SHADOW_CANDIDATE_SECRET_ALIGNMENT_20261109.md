# Step3 Shadow canonical candidate bearer mismatch: version-only secret alignment (2026-11-09)

## Real physical evidence

Protected read-only [run #42580344631](https://github.com/blocknine0/geomacro/actions/runs/42580344631) physically checked two exact unpromoted canonical versions:

| Shadow Worker | Candidate | Retired public | Invalid bearer | Owner's protected GitHub bearer |
|---|---|---|---|---|
| Modern | `565118e5-781f-4a3a-ad73-d304d4876e8a` | JSON 404 NOT_FOUND PASS | JSON 401 UNAUTHORIZED PASS | JSON 401 UNAUTHORIZED (HOLD) |
| Legacy | `214742c7-bc20-4ff8-bbed-cc3b41604aff` | JSON 404 NOT_FOUND PASS | JSON 401 UNAUTHORIZED PASS | JSON 401 UNAUTHORIZED (HOLD) |

Both candidates bind to isolated Shadow D1, preserve source SHA `593a3c8b96f8a59005bee96ac76df57f07484e1e`, and have 0% live traffic. Both original `shadow-entry.js` versions remain 100% deployed. The canonical entrypoint is fixed in the unpromoted candidates; the only remaining proven failed acceptance is the independent Shadow admin bearer mismatch.

**Never use existing `step3-shadow-bearer-sync.yml` at this stage:** it probes the *live* broken `shadow-entry.js` first and uses `PUT /workers/scripts/{script}/secrets`, which is not safely scoped to unpromoted candidates. Updating the existing deployed Worker is not equivalent to a new immutable no-traffic candidate.

## Correct permanent change

Cloudflare documents `wrangler versions secret put CONTROL_PLANE_TOKEN --name <script>`: this **creates a new immutable version without deploying or promoting it**. By contrast, `wrangler secret put` immediately deploys. Official docs:
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/

The protected manual workflow `step3-shadow-candidate-secret-align.yml` requires:
- Explicit owner approval `ALIGN_TWO_IMMUTABLE_SHADOW_CANDIDATE_SECRETS_NO_TRAFFIC`, exact current `main` SHA, existing protected canary HOLD, known Cloudflare account and distinct real Shadow vs production D1 UUIDs.
- Current **latest uploaded version** to equal the exact **known canonical candidate ID** for BOTH Workers; older `shadow-entry.js` version remains 100% deployed. This prevents inheriting the wrong version.
- Source SHA pinned, existing named `CONTROL_PLANE_TOKEN` and modern private R2 bucket binding, no production database binding, and provider-returned unique exact immutable candidate URL.
- Live invalid-bearer JSON 401 plus the GitHub protected independent Shadow bearer yielding JSON 401 (a **real mismatch**) before any secret change. If the token already authenticates, HOLD without a needless mutation.
- No production bearer fallback and no logging, printing or storing the protected secret. It is passed into `wrangler versions secret put` through process stdin, not CLI arguments or files.
- Immediately after each **version-only** update, verify new immutable version identity and code/compatibility parity, full binding/resource parity, the OLD deployed version still at 100%, exact source SHA, and provider-authored version URL.
- Physically require the new version URL to return JSON 404 NOT_FOUND (retired public), JSON 401 UNAUTHORIZED (deliberately invalid bearer), and JSON 400 P0B_STATUS_QUERY_INVALID (valid independent Shadow bearer on intentionally invalid query, with no D1 read). On any mismatch, HOLD, never deploy or lift canary hold.
- If first Worker passes but second fails, leave the first new version **unpromoted** and expose a redacted partial-state receipt; no fabricated all-pass.

The workflow is **manually dispatched only after checks and reviewed merge to main**. It does not deploy traffic. No production Worker or D1 access, Shadow D1 mutation, B2/R2 operation, PayPal/x402 activation, Predge contract change, signed GRO assumption or canary hold release is included.

### After this stage

Even if both new immutable versions physically PASS, a separate reviewed **Shadow-only deployment/promotion** is needed. Afterward recheck the ordinary script hostnames' JSON 404/401/400, original B2 bytes GET/readback, Shadow pointer HMAC and independent quota/headroom/recovery receipts before any protected production migration and canary. Do not mistake candidate verification for production success.
