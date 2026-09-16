# Final Non-Mainnet Launch Acceptance

This gate closes the remaining pre-launch evidence gaps without activating production payments, mainnet, autonomous execution, or public launch.

## Workflow

`.github/workflows/final-nonmainnet-launch-acceptance.yml`

Automatic pull-request checks verify the acceptance contract, staging production-host guard, prelaunch lock, and a full disposable local Supabase migration replay plus backup/restore integrity drill.

After merge to `main`, the workflow also performs:

- current-candidate production build;
- previous-commit rollback-target build;
- dependency recovery and Risk Object key lifecycle regression;
- nonproduction rollback/incident control drill;
- live public-route and machine-discovery smoke against `https://geomacro.live`;
- outside-in, non-destructive security-header/reflection/error-disclosure smoke against `https://geomacro.live`.

A manually dispatched strict run additionally performs the bounded isolated staging Risk Gate HTTP load/SLO test using the existing `staging` GitHub environment:

- variable `RISK_GATE_STAGING_BASE_URL`;
- secret `RISK_GATE_STAGING_API_KEY`.

The staging harness refuses the production host and records request volume, concurrency, status distribution and latency percentiles in `artifacts/risk-gate-staging-http-load.json`.

## Backup and restore drill

`scripts/db/disposable-backup-restore-drill.sh` refuses any non-local database URL. It:

1. runs only against disposable local Supabase;
2. writes a sentinel probe;
3. creates a custom-format dump of the application `public` schema;
4. destructively drops only the disposable local `public` schema;
5. restores the dump;
6. verifies the sentinel, core `events` table and table-count integrity;
7. records the dump hash and result.

This tests the restore procedure without touching the production database. A production backup policy/provider restore capability remains an operational/provider responsibility and must not be represented as tested by this drill.

## Live surface smoke

`scripts/ops/live-launch-surface-smoke.mjs` uses GET-only requests. It verifies primary commercial routes and the canonical agent/x402 discovery resources, and confirms that machine-readable commerce discovery still says:

- `status = prelaunch`;
- `execution_authorized = false`;
- `production_funds_authorized = false`;
- every provider remains `production_enabled = false`.

No payment or settlement is attempted.

## Outside-in security smoke

`scripts/ops/external-surface-security-smoke.mjs` checks the deployed HTTPS surface from the GitHub runner for HSTS, MIME-sniff protection, referrer policy, clickjacking protection, stack-disclosure indicators and a harmless reflected-script probe.

It is deliberately non-destructive and unauthenticated. It is not a third-party penetration test, security certification, or claim that the application is invulnerable.

## Rollback and incident drill

The workflow builds both the current candidate and its immediate previous commit, then runs recovery/key-lifecycle regressions and records a synthetic nonproduction incident sequence. All production provider flags and real-funds authorization must remain disabled throughout.

## Acceptance boundary

A successful automatic `main` run proves the automated non-mainnet gates above. A strict manually dispatched run is required to add fresh isolated staging load/SLO evidence for the exact final release candidate.

Even a completely successful run does **not** authorize mainnet or real-money launch. Production activation remains a separate owner-authorized action behind the existing commercial launch acknowledgements and provider-specific real-funds gates.
