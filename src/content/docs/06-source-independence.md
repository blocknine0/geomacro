# 6. Source Independence

A high volume of repeated reporting is not the same as independent evidence.

Geomacro's current GRI v1.2 methodology addresses concentration at two levels:

1. **Source concentration:** evidence from one source has a capped weight budget.
2. **Story concentration:** multiple publisher reports describing the same underlying development share one independent-story budget.

```text
20 URLs ≠ 20 independent confirmations
```

```mermaid
flowchart TD
    A[Underlying development] --> B[Publisher A report]
    A --> C[Publisher B report]
    A --> D[Publisher C rewrite]
    B --> E[Story cluster]
    C --> E
    D --> E
    E --> F[One bounded story evidence budget]
```

The public GRI proof package exposes both evidence-record count and independent-story count so readers can judge concentration instead of relying on URL volume alone.
