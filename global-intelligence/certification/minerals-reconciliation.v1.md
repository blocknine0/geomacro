# Critical Minerals Reconciliation Certification

The reconciliation layer keeps production, world-production baselines, trade, facilities, disruption/policy, early signals, and historical context as separate evidence classes.

## Rules
1. Production cannot be inferred from exports/imports.
2. Trade cannot be treated as mine production.
3. Historical observations are context unless separately versioned for current use.
4. Distinct source IDs are required for cross-source corroboration.
5. Different units/commodity scopes are conflicts, not values to average.
6. Missing data is not zero.
7. Freshness is reported per observation.
8. Newer evidence does not automatically erase historical context.
9. Telegram early signals cannot confirm production/disruption alone.
10. Official/verified sources still require identity and scope checks.

## Runtime gate

Tests must demonstrate deterministic grouping, duplicate-source handling, production/trade separation, unit conflict detection, magnitude conflict detection, freshness calculation, historical separation, and no fabricated values.
