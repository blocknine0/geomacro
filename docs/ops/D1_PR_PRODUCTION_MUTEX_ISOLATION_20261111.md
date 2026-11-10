# D1 Control Plane permanent PR-vs-production mutex repair

GitHub Actions concurrency permits at most one running and one pending run
per group, and can replace an older pending run even when
`cancel-in-progress: false`. Here numerous pull_request offline-regression
checks used the identical `geomacro-d1-control-plane-production` group as
the actual main Worker deployment, interfering with release cadence.
The production deploy after Hot50 Complex fix (#3872) was marked cancelled,
and the 50x3 Worker proof still called an older deployed Worker.

This change isolates ONLY pull_request offline contract testing under
`geomacro-d1-control-plane-pr-<PR-number>`. Actual production main pushes
and authorized workflow_dispatch runs KEEP
`geomacro-d1-control-plane-production`, which is shared with D1 migration
and canary-release workflows. PR does not use production secrets, customer
funds, or Cloudflare SQL writes. All existing migration 80k headroom,
canary hold, D1/B2 quotas, exact-main, shadow receipts, rollback and
required dual-worker proofs remain intact. No automatic full canary
promotion or production bypass is introduced.

A green offline contract is NOT a live deployment receipt. The live
main push must still prove Worker version, D1 and B2 readback and the
authenticated Hot50 tier responses before claiming recovery.
