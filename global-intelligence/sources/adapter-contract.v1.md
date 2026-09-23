# Source Adapter Contract v1

Every source adapter must implement the same logical contract:

## Input
- country ISO2/ISO3
- category
- time window
- optional query/entity

## Output
- source_id
- source_class
- retrieval_at
- published_at when available
- canonical_url
- source_reference
- raw_content_hash
- normalized_claims
- country/entity scope
- freshness
- authority metadata
- commercial/reuse metadata
- adapter_status

## Required live checks
1. Endpoint reachable.
2. Authentication works when required.
3. Response parses.
4. Response contains expected fields.
5. Source reference is stable enough for provenance.
6. Freshness is within category SLA.
7. Failure is retryable and observable.
8. Rate limits are respected.
9. Terms/reuse status are recorded.
10. Duplicate/replay handling is deterministic.

A source cannot count toward a 100% certified cell unless its adapter passes all applicable checks.
