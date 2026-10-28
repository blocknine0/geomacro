# Website publication / isolated candidate recovery — 2026-10-28

## Verified website publication

- Canonical GitHub main `e895db01e1de2f489194db1fdfdc9f7a79e8b6f1` was synchronized into the owner's Lovable project `06310982-d80d-4d51-a786-7a015bd39be3`.
- A Lovable production publication was requested from the actual owner-connected project; the request initially reported pending, not a false success.
- Independently rerun [minimum free-site acceptance #40662075666](https://github.com/blocknine0/geomacro/actions/runs/40662075666) later succeeded: published marker exactly `e895db01...`; `FREE_DERIVED_NEWS_SSR_VERIFIED`; /api/health?deep=1&profile=free-derived HTTP 200; language controller passed. It showed 9 Geopolitics, 0 Macro, 0 Minerals qualified originals; do not claim three-category launch acceptance or signed production readiness.
- The original first-attempt run was honestly failed and remains historical evidence.

## Isolated Cloudflare candidate

- Existing Worker name `geomacro-web-candidate` returned `CANDIDATE_PRIVATE_OR_UNKNOWN_BINDING_PRESENT` from its remote metadata. Its unknown remote bindings **must not be grandfathered, copied, removed silently, exposed or added to an allowlist**.
- Build a *new, distinctly named* `geomacro-web-candidate-isolated` Worker from the same canonical main build. It is read-only, no routes or production domain, no private/predge/commerce/D1/B2 credentials. This avoids inheriting the older candidate's uncontrolled bindings while retaining the strict predeploy security guard for the new name on every future deployment. The old worker is intentionally untouched and does not become a promoted release candidate.
- Revalidate the *only* allowed candidate metadata bindings: `assets ASSETS`, `plain_text GEOMACRO_SUPABASE_RUNTIME_MODE=standby`, `secret_text GEOMACRO_SECURITY_FINGERPRINT_PEPPER`. Unknown binding, changed value or provider metadata failure => hard failure. The pepper is generated separately, never logged.
- Wrangler `--keep-vars` is allowed only **after** the remote guard passes; never relax the guard to preserve secrets.
- The candidate uses its own `workers.dev` URL only. It must not claim that `geomacro.live` has been deployed or replaced by the candidate.

## Fail-closed end-to-end acceptance

1. GitHub **Product CI** and candidate security offline tests pass for the *same* current main; superseded main rejects deploy.
2. Remote binding guard passes **before** isolated candidate creation/update.
3. Candidate assets and two pinned image hashes match known owner-published assets; canonical current-main SHA is readable from its served `/.well-known/geomacro-build.json`.
4. HTTP GET /, /intelligence, free machine discovery; state-mutating requests and private auth rejected.
5. Independent public `geomacro.live` readback checks published full main marker, first HTML, latest usable 72h archive and `free-derived` health; browser QA must separately check JS, nav and render behavior before claiming full end-to-end.
6. Do not edit PREDGE, increase commercial privileges, activate billing, grant paid rights, rewrite source clocks, or turn a soft/free-source pass into a current signed-product acceptance.

## Remediation if candidate still fails

Read the new isolated candidate's **sanitized** failed step and stop. Do not add unknown remote bindings to the allowlist. If deployment provider metadata indicates an unexpected script collision, use an explicit new reviewed identity or investigate on the Cloudflare owner dashboard. Never overwrite the owner-controlled production website from this read-only candidate workflow.
