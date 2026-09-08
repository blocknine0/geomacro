# 2. Product Architecture

Geomacro uses a shared evidence and provenance foundation with product-specific admission and decision policies. Public intelligence, GRI, Ask Geomacro and machine interfaces should not maintain conflicting versions of the same underlying fact.

```mermaid
flowchart TD
    A[Global intelligence sources] --> B[Normalized observations]
    B --> C[Evidence + provenance]
    C --> D[Structured events / state]
    D --> E[Risk methodology]
    E --> F[Published intelligence]
    F --> G[GRI]
    F --> H[Ask Geomacro]
    F --> I[Risk Objects]
    I --> J[Risk Gate]
    F --> K[Data / API]
    F --> L[Research]
```

## Policy layers

Geomacro separates several decisions that are easy to confuse:

- **Evidence admission** — is an observation credible and sufficiently attributable?
- **Product admission** — which product surface may use it?
- **Scoring admission** — can it affect a numeric score?
- **Commercial eligibility** — may it enter a paid/commercial delivery path?
- **Persistence** — what durable structured evidence should be retained?

```mermaid
flowchart LR
    A[Observation] --> B{Evidence admitted?}
    B -->|No| C[Reject / quarantine]
    B -->|Yes| D{Product allowed?}
    D -->|No| E[Exclude from product]
    D -->|Yes| F{Scoring eligible?}
    F -->|Yes| G[Can affect score]
    F -->|No| H[Context only]
```

The architecture is intentionally fail-closed where missing provenance, freshness, verification or commercial eligibility would otherwise create an unsafe inference.
