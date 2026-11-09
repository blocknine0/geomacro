# Step3 immutable canonical Shadow candidate HTTP acceptance — 2026-11-09

## Source proof and candidate identities

[GitHub run #42578617878](https://github.com/blocknine0/geomacro/actions/runs/42578617878) returned `PASS_CANDIDATES_UPLOADED_ZERO_TRAFFIC` for exact main source SHA `593a3c8b96f8a59005bee96ac76df57f07484e1e` and preserved existing 100%-deployed Shadow versions:

| Worker | Unpromoted candidate | Current deployed |
| --- | --- | --- |
| geomacro-step3-shadow | `565118e5-781f-4a3a-ad73-d304d4876e8a` | `48680b70-c41c-4af9-9e70-497213471dbb` |
| geomacro-step3-shadow-legacy | `214742c7-bc20-4ff8-bbed-cc3b41604aff` | `73437c7b-83b2-44df-bbc5-87be1df25a9b` |

Both candidates inherit the existing protected Shadow bindings and the canonical `src/index.mjs`. No Shadow or production D1 rows were mutated, no R2 or B2 objects were written, and no traffic was promoted. Candidate upload is **not** live HTTP acceptance.

## Exact authenticated acceptance

The new `step3-shadow-canonical-candidate-http.yml` can be manually dispatched on merged `main` using `approval=VERIFY_TWO_CANONICAL_SHADOW_CANDIDATES_READ_ONLY`.

The read-only checker:
1. Enforces exact protected main, owner approval, existing canary HOLD, pinned account, distinct production vs Shadow D1 UUIDs and both known Shadow hostnames.
2. Uses Cloudflare **GET only** for provider D1 database identities, Shadow script deployments, script subdomain settings, exact pinned candidate version bindings and current Worker immutable-version-specific URLs. It validates that the OLD versions still have 100% traffic, the NEW versions are not deployed and each candidate is bound only to the pinned Shadow D1 and original private R2 where appropriate.
3. Accepts only a provider-returned single unique version host of the form `<8 lowercase hex>-<allowlisted-script>.daspallab202391.workers.dev`. **Never guesses** a candidate URL from a UUID or trusts redirects, HTTP pages, or arbitrary hostnames.
4. Confirms exact JSON `404 NOT_FOUND` for retired public endpoint, JSON `401 UNAUTHORIZED` for invalid admin bearer, and JSON `400 P0B_STATUS_QUERY_INVALID` using the existing independent Shadow owner bearer `GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN`. Each route is selected so D1 queries are not needed.
5. Saves only sanitized identity/probe status/error codes, not public version hosts, HTTP bodies, tokens, private bindings, article text or credentials. A provider URL absent, 404/non-JSON, missing valid bearer or a Cloudflare Access challenge remains `HOLD`.

**No code deployment, traffic promotion, production D1 migration, Shadow D1 write, private B2/R2 storage operation or payment execution occurs.** Success is `PASS_CANDIDATES_HTTP_VERIFIED_NOT_PROMOTED` and is not a Stage 1 / Stage 2 / canary release pass.

After all required checks and review, merge this PR and explicitly run:

```bash
gh workflow run step3-shadow-canonical-candidate-http.yml \
  -R blocknine0/geomacro --ref main \
  -f approval=VERIFY_TWO_CANONICAL_SHADOW_CANDIDATES_READ_ONLY
```

Inspect the GitHub Actions run's sanitized artifact `geomacro-step3-shadow-canonical-http-<run_id>`. Even if candidate HTTP passes, protected Shadow-only deployment requires **a separate reviewed exact-version controlled promotion** and fresh ordinary hostname HTTP evidence before genuine B2 original ACK, Shadow D1 parity, and any production canary.
