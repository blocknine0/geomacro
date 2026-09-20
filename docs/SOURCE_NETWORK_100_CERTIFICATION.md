# Geomacro Source Network: 100% Commercial Certification Contract

## Purpose

Geomacro's source strategy is not complete when a URL is registered or when an endpoint returns HTTP 200. A production source is eligible for commercial intelligence only after its identity, access path, rights, dataset/version semantics, schema, freshness, provenance, independence, adapter/runtime behavior and fallback policy are evidenced.

## Certified source rule

A source may enter `CERTIFIED` only when all applicable gates pass:

```text
source identity
  -> canonical endpoint
  -> commercial/derived-use rights
  -> schema + dataset/version
  -> freshness SLA
  -> provenance
  -> source independence
  -> adapter tested
  -> runtime ingestion passed
  -> fallback ready or not required
  -> signed certification evidence
```

Registration, endpoint reachability and browser accessibility are not certification.

## Coverage layers

The source network is treated as four related but distinct coverage layers:

1. Country: official and specialist sources relevant to the 195-country subject universe.
2. Corridor: directional origin -> destination evidence for bilateral risk.
3. Global shock: cross-border event families such as conflict, sanctions, trade, financial, energy, shipping and critical-minerals shocks.
4. Critical minerals: mineral, country, supply-chain, trade, policy and disruption evidence.

A source can cover multiple layers, but each layer still requires an explicit coverage path and certification state.

## Endpoint disposition

The global endpoint probe classifies every discovered URL as one of:

```text
WORKING
CANONICAL_REDIRECT
AUTH_REQUIRED
WAF
DEPRECATED
WRONG_ENDPOINT
TIMEOUT
DNS_FAILURE
BLOCKED_ENVIRONMENT
FAIL
```

A transport success is not automatically an ingestion success. The probe also performs a bounded GET verification after a successful HEAD when appropriate.

## Risk Gate boundary

The current website and external Private Pilot describe a testnet/private-pilot country and directional-corridor decision-context capability. The caller supplies policy; Geomacro returns bounded decision context and keeps:

```text
execution_authorized = false
```

The production commercial source gate is deliberately stricter than the current testnet demonstration path. Until the source-network launch gate is green, public materials must not describe the complete source network as generally production-certified.

## Realtime exception

Realtime feeds have source-specific freshness SLAs. GDELT GAL currently has a 1,800-second freshness ceiling in the source-network launch contract. A stale realtime backbone must keep readiness closed.

## Evidence and audit

Each certification is expected to be reproducible from stored evidence references and a certification hash. The source network must therefore answer:

- Which source was used?
- Which exact endpoint/dataset/version?
- When was it retrieved?
- What rights permit the intended use?
- Which independent sources corroborate it?
- Which adapter/runtime produced the normalized evidence?
- What happened when the source failed or became stale?
- Which Risk Object(s) consumed the resulting evidence?

## Testnet-first operating rule

Current source-network work is validated in nonproduction/testnet environments first. Production promotion occurs only after the complete evidence graph and automated acceptance gates are green.

## Final acceptance

The canonical machine-generated status is:

```text
live_source_network_100_status.source_network_100_complete = true
AND
live_source_network_launch_status.source_network_launch_complete = true
```

Anything else is not 100% commercially certified.
