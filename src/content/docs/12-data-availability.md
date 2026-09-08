# 12. Data Availability

Geomacro models missing, stale and unverifiable information explicitly. Missing evidence is never silently converted into zero risk.

## Public GRI availability

The public Global Risk Index reads only an immutable published snapshot that satisfies the current GRI contract. The read model checks methodology/proof compatibility, required hashes, reconciliation, story-correlation provenance and freshness.

If a qualifying current snapshot is not available, the public surface should show the index as unavailable rather than synthesize a score.

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