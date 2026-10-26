# Geomacro GitHub Actions Permanent Inventory (v1)

This directory keeps retired one-time/paused Actions definitions as **non-executable rollback records**. GitHub Actions only discovers workflows under `.github/workflows/`.

## Locked operational agreement

- The canonical inventory is `config/github-workflow-inventory.v1.json`.
- The main PR/push test `Product CI` runs `node scripts/ops/verify-github-workflow-inventory.mjs` before any network install. Any added or removed workflow requires an explicit inventory update.
- `criticalWorkflowFiles` permanently protects important ingestion, D1, B2, deployments, security, x402, WDI, Telegram, commerce and PREDGE paths.
- `lockedDisplayNames` protects important `workflow_run.workflows` name-based triggers. Do not rename them without updating all callers.
- `lockedTriggerStrings` protects critical intervals and wake-up dependencies; GitHub Actions cron is best-effort, **not an ingestion SLA**.
- `predgeBlobSha1` freezes every `predge-*.yml` Git blob. Any PREDGE change must be a separate explicitly authorized review, with a manifest update.
- Archived definitions must remain outside the Actions directory. Restoration requires an audited PR, an explicit source/CI review, and inventory edits.
- Production secrets, external rate limits, permissions, live run success and deployment health cannot be established by the offline inventory gate. Check Actions and target service readback separately.
- Do not change source rights/commercial decisions through this workflow-inventory PR.

## Core production schedules (UTC; best-effort)

| File | Existing display name | Schedule |
| --- | --- | --- |
| `five-minute-original-news-fastlane.yml` | Five-Minute Original News Fastlane | `2-57/5 * * * *` |
| `private-global-osint-15m.yml` | Global OSINT to Website Intelligence (15-Minute Discovery) | `*/15 * * * *` |
| `three-domain-30m-original-publisher-pulse.yml` | Three-Domain 30-Minute Original Publisher Pulse | `12,42 * * * *` |
| `website-derived-news-continuity.yml` | Website Derived News Continuity | `7 * * * *` |
| `auto-ingest-news.yml` | Auto Ingest News | `37 * * * *` |
| `risk-indices-verified-parent-backstop.yml` | Risk Indices Verified GRI Parent Repair Backstop (No Funds) | `11,41 * * * *` |
| `governed-source-ingestion.yml` | Governed production source ingestion | `17 2 * * *` |

## Archived by this change

- `Auto-generate-briefings.yml`
- `auto-create-markets.yml`
- `auto-recovery.yml`
- `diagnose-statcan-original-atom.yml`
- `market-lifecycle.yml`
- `one-shot-free-tier-recovery-dispatch-20261001.yml`
- `one-time-b2-raw-storage-recovery.yml`
- `one-time-b2-source-cert-evidence-idempotent-recovery.yml`
- `patch-supabase-independent-risk-fallback-once.yml`
- `security-monitor.yml`

This is a **safe first-pass retirement**, not a claim that every other historical workflow is needed. The inventory controls further cleanup without silently removing scheduled or referenced functionality.
