# Source Evidence Graph and Automated Promotion

Geomacro keeps source certification as an evidence graph rather than a mutable status flag.

Each registered source gets an evidence run and ten required dimensions:

REGISTRY, ENDPOINT, RIGHTS, SCHEMA, FRESHNESS, PROVENANCE, INDEPENDENCE, ADAPTER, RUNTIME, FALLBACK.

A source can reach CERTIFIED only when every dimension has a PASS node backed by VERIFIED or OBSERVED evidence. The database promotion function recomputes the certification hash from the exact evidence nodes in that run.

Rights are source-specific. URL reachability, registry metadata and licence-name fields are never sufficient. Exact reviewed rights evidence may come from the pinned commercial-rights manifest or from an official publisher-surface crawler that finds explicit reuse/licensing language. Ambiguous rights stay blocked.

The collector records live endpoint evidence, machine-schema observations, freshness observations, publisher-domain continuity, provider diversity, repository adapter/test references, recent normalized runtime observations, and governed fallback evidence. Raw third-party payloads are not exposed to customers by this layer.

Promotion is automatic, but fail-closed. The job only changes internal certification state and required-path attestation after the database guards pass. It does not enable ingestion, enable commercial signals, charge, settle, or bypass source-rights boundaries.

The permanent workflow runs after a successful production database deployment, every six hours, and on manual dispatch. It writes an auditable evidence artifact set under artifacts/source-certification-evidence-graph.

source_network_100_complete remains a factual gate. A graph can be complete while individual sources remain blocked because one or more required evidence dimensions are missing or failed. No source is promoted merely to make the global gate green.
