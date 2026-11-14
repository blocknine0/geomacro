# 12. Data Availability

Geomacro models missing, stale and unverifiable information explicitly. Missing evidence is never silently converted into zero risk.


Public presentation is fail-soft:

- a previously verified reading stays visible if a later refresh fails;
- a cold read uses a neutral refreshing/loading state rather than exposing a raw infrastructure error;
- a domain without a current verified score does not receive a synthetic or zero-risk substitute;
- recovery continues through the verified read path rather than falling back to a browser-side recalculation.


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
