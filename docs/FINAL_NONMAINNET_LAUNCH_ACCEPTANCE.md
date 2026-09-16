# Final Non-Mainnet Launch Acceptance

This gate closes the remaining pre-launch evidence gaps without activating production payments, mainnet, autonomous execution or public Early Warning push distribution.

## Workflow

`.github/workflows/final-nonmainnet-launch-acceptance.yml`

Automatic pull-request checks verify the acceptance contract, staging production-host guard, prelaunch lock, receipt-wired Early Warning shadow lock and a full disposable local Supabase migration replay plus backup/restore integrity drill.

After merge to `main`, the automatic workflow can also perform repository/nonproduction controls such as:

- current-candidate production build;
- previous-commit rollback-target build;
- dependency recovery and Risk Object key lifecycle regression;
- nonproduction rollback/incident control drill;
- outside-in, non-destructive security-header/reflection/error-disclosure smoke against `https://geomacro.live`.

It intentionally does **not** claim that the newly mirrored commit is already live on Lovable. Git mirror synchronization and Lovable publication are separate operations.

## Strict post-publish run

After the exact canonical main commit has been mirrored and then explicitly published through Lovable **Publish changes**, manually dispatch `Final Non-Mainnet Launch Acceptance` with:

- `published_sha`: the exact 40-character canonical `main` SHA that was published;
- the bounded staging request/concurrency/mode inputs.

The strict run requires `published_sha` to equal the workflow's exact canonical main SHA. The live smoke then reads:

`https://geomacro.live/.well-known/geomacro-build.json`

and requires its `canonical_main_sha` to match the same value. A stale live deployment therefore cannot pass acceptance merely because Git mirror synchronization succeeded.

The manually dispatched strict run also performs the bounded isolated staging Risk Gate HTTP load/SLO test using the existing `staging` GitHub environment:

- variable `RISK_GATE_STAGING_BASE_URL`;
- secret `RISK_GATE_STAGING_API_KEY`.

The staging harness refuses the production host and records request volume, concurrency, status distribution and latency percentiles in `artifacts/risk-gate-staging-http-load.json`.

## Early Warning distribution closure coverage

The public Early Warning self-distribution surface is launch-critical even though live push remains disabled. Changes to its canonical feed, receipt ledger, worker, poller, RSS surface, distribution configuration or receipt migrations trigger the final non-mainnet acceptance workflow.

The contract job verifies on the exact evaluated ref that:

- `mode = prelaunch-shadow`;
- `default_dry_run = true`;
- `live_publish_enabled = false`;
- the live worker is wired to the durable receipt ledger;
- ambiguous and stale-unfinalized outcomes remain manual-only;
- the canonical public-feed adapter and receipt contract tests pass;
- fixture rendering stays dry-run;
- fixture input cannot enter live mode.

The commercial release-candidate evidence generator also hashes the Early Warning distribution configuration, worker/poller/receipt helper and migrations 937/940/941/942. The evidence records that public push is still live-disabled. This makes the exact candidate auditable without authorizing publication.

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

`scripts/ops/live-launch-surface-smoke.mjs` uses GET-only requests and runs as part of the strict manually dispatched post-publish acceptance.

It verifies primary commercial routes and required machine-discovery resources, including:

- `/.well-known/x402.json` as the host-compatible canonical x402 discovery document;
- `/.well-known/geomacro-commerce.json`;
- `/.well-known/geomacro-agent.json`;
- `/.well-known/geomacro-build.json` with the exact published canonical SHA;
- `/openapi-x402.json`;
- `/llms.txt`.

`/.well-known/x402` remains an extensionless compatibility alias. If the host serves it with HTTP 200, the smoke validates the same safe prelaunch contract. A host-level 404 for this optional alias is recorded but does not replace or weaken the required `/.well-known/x402.json` check.

The live discovery contract must continue to say:

- `status = prelaunch`;
- `execution_authorized = false`;
- `production_funds_authorized = false`;
- every provider remains `production_enabled = false`.

No payment or settlement is attempted.

## Outside-in security smoke

`scripts/ops/external-surface-security-smoke.mjs` checks the deployed HTTPS surface from the GitHub runner for HSTS, MIME-sniff protection, referrer policy, clickjacking protection, stack-disclosure indicators and a harmless reflected-script probe.

It is deliberately non-destructive and unauthenticated. It is not a third-party penetration test, security certification or claim that the application is invulnerable.

## Rollback and incident drill

The workflow builds both the current candidate and its immediate previous commit, then runs recovery/key-lifecycle regressions and records a synthetic nonproduction incident sequence. All production provider flags and real-funds authorization must remain disabled throughout.

## Acceptance boundary

A successful automatic `main` run proves repository/nonproduction gates for that commit. It does **not** prove the Lovable live site has published that commit.

A successful strict manually dispatched run, performed only after Lovable **Publish changes**, adds:

- exact live-deployment SHA proof;
- live public/discovery surface proof;
- fresh isolated staging load/SLO evidence.

Even a completely successful run does **not** authorize mainnet, real-money launch or Early Warning push activation. Production activation and public push activation remain separate owner-authorized actions behind their existing gates.
