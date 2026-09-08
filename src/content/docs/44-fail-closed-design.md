# 44. Fail-Closed Design

Geomacro prefers explicit unavailability or escalation over manufactured certainty.

Examples of conditions that should not silently become a successful fresh Risk Gate decision include:

- authentication backend failure
- rate-limit backend failure
- unsupported schema, subject or methodology
- invalid or missing signature
- expired/stale object where policy requires freshness
- unavailable required risk inputs
- malformed request
- required audit-persistence failure
- commercially ineligible source path

For the public GRI, an incompatible, incomplete or stale snapshot is not replaced by a synthetic zero.

For Risk Gate, `execution_authorized=false` remains the Geomacro boundary. Customer policy may choose approval escalation, pause, reduced limits or another fallback, but Geomacro does not silently authorize execution from unverifiable context.