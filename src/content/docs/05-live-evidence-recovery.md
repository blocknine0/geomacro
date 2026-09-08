# 5. Live Evidence Recovery

**Status: IN DEVELOPMENT**

Not every current event should be stored permanently. Geomacro's longer-term architecture includes on-demand evidence recovery when durable stored intelligence is insufficient.

```mermaid
flowchart TD
    A[Question / decision] --> B[Coverage check]
    B --> C{Stored evidence sufficient?}
    C -->|Yes| D[Use canonical intelligence]
    C -->|No| E[Recovery path]
    E --> F[Multiple source families]
    F --> G[Normalize + deduplicate]
    G --> H[Corroborate / detect contradiction]
    H --> I[Temporary evidence envelope]
    I --> J{Persist?}
    J -->|Yes| K[Promote durable structured evidence]
    J -->|No| L[Do not persist]
```

> **Current product boundary:** the live Ask Geomacro implementation is grounded in stored Geomacro intelligence and does not currently invoke a general live-web evidence recovery path when evidence is missing.

The design principle is: **hot evidence can remain recoverable; durable intelligence should remain structured and attributable.**
