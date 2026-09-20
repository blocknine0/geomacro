# Agentic Economy Recurrence Governance

This repository treats recurring agentic-commerce failures as regression classes, not one-off incidents.

## Enforced invariants

- Agentic and commercial GitHub Actions use immutable commit-SHA pins.
- actions/checkout never persists repository credentials.
- Application workflows use the committed frozen Bun lockfile and do not drift to npm install or npm ci.
- Workflow governance covers every known agentic/commercial workflow and every workflow changed in the current revision.
- Manual acceptance workflows bind execution to the exact candidate SHA supplied at dispatch time.
- Production payment readiness remains explicitly prelaunch and non-authorizing until the separate launch gates pass.
- Migration version collisions and destructive migration patterns fail closed.
- Generated TanStack Router output must remain committed and match the source route tree.

## Historical failure classes covered

The governance layer is designed to prevent recurrence of the failure families previously found across x402, Coinbase, Circle, Nevermined, GOAT, A2A, Risk Gate, payment/delivery reconciliation, marketplace acceptance, migration ordering, dependency drift, and stale generated artifacts.

A new workflow cannot bypass the gate merely by using a new filename: workflow files changed by the current revision are automatically included in governance checks.

The canonical enforcement point is Product CI. Product CI itself is included in the workflow-change trigger path, uses a full-history checkout for PR-diff inspection, and runs migration safety before build completion.

Real-money production authorization is not implied by these checks.
