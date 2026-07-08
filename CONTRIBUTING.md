# Contributing

Thanks for taking the time to look at Geomacro.

## Ground rules

- Run `bun run lint` and `bunx vitest run` before opening a PR.
- Keep `src/**.server.ts` files out of client imports. Server logic is
  reached via `createServerFn` + `useServerFn`, never via direct import.
- Never store private keys or API secrets in `VITE_*` env vars = those
  ship to the browser.
- New onchain interactions must be signed by the user's wallet; the
  server never holds a signing key.
- New client-facing data must go through `src/lib/live-feed.sanitize.ts`
  (or an equivalent allowlist) so internal identifiers do not leak. The
  test `src/__tests__/live-feed-no-ids.test.ts` enforces this.

## Working on the automation (`scripts/` + `.github/workflows/`)

- **Any `.update()`/`.insert()` against `events`, `positions`, or
  `wallet_balance_history` from a GitHub Actions script must use the
  service-role Supabase client, not the anon key.** The `anon` role only
  has `SELECT`/`INSERT` grants on `events` (see the RLS policies in
  Supabase) — a write through the anon client fails *silently*: no
  thrown error, zero rows affected, and the script logs success anyway.
  This exact bug orphaned ~90 markets earlier in the project's history.
  If you add a new script that writes to Supabase, add the
  `SUPABASE_SERVICE_ROLE_KEY` env var to its workflow file and construct
  an admin client the same way `finalize-markets.js` does.
- Don't swallow errors into a generic message (`catch (err) { console.log("skip") }`).
  Log `err.message`/`err.reason` — a masked error is how the flags-not-persisting
  bug above went unnoticed for as long as it did.
- New scheduled scripts need both a `scripts/*.js` file *and* a matching
  `.github/workflows/*.yml` — the workflow is what actually wires env vars
  to the script; adding one without the other is a no-op.
- If a script marks something as done/resolved before every downstream
  step actually completed (e.g. flipping `market_resolved` before
  `positions` finished syncing), that record becomes unrecoverable by any
  later run that filters on the same flag. Only set a completion flag
  after the write it gates has been confirmed.

## Reporting a security issue

Please do not open public issues for security reports. Use a private
GitHub security advisory instead.
