# 12. Data Availability

Geomacro models missing, stale and unverifiable information explicitly. Missing evidence is never silently converted into zero risk.

## Public Risk Indices availability

The public Geopolitical, Macroeconomic and Critical Minerals Risk Indices read only a verified published package compatible with the current public contract. The read path checks the parent methodology/proof versions, required integrity hashes, reconciliation, story-correlation provenance and snapshot validity before accepting the package.

Public presentation is fail-soft:

- a previously verified reading stays visible if a later refresh fails;
- a cold read uses a neutral refreshing/loading state rather than exposing a raw infrastructure error;
- a domain without a current verified score does not receive a synthetic or zero-risk substitute;
- recovery continues through the verified read path rather than falling back to a browser-side recalculation.

The current public split preserves the versioned GRI v1.2 parent methodology and verified proof lineage. Historical combined-GRI snapshots remain versioned audit records rather than a second live headline score.

## Risk Gate availability

Risk Gate distinguishes valid context from degraded states. Relevant states include, where supported by the implemented contract:

- `VERIFIED` — required integrity and freshness checks passed
- `STALE` — a prior verified object exists but freshness has passed
- `EXPIRED` — outside the policy-evaluation window
- `INCOMPLETE` — required inputs are missing
- `UNVERIFIABLE` — schema, methodology, provenance or signature checks cannot be completed

A stale, expired, malformed or unverifiable object must not become an implicit `CONTINUE` decision.

```text
required context available and verifiable?
        ├─ yes → evaluate current policy
        └─ no  → degraded / fail-closed path
```

Availability is a property of the evidence and contract at a point in time, not a claim that real-world risk itself is absent.
