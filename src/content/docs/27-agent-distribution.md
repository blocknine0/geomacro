# 27. Agent Distribution

Geomacro's current machine-delivery foundation is the authenticated Private Pilot Risk API / Risk Gate interface.

The product should remain transport-agnostic: the intelligence and Risk Object contracts should not depend on one marketplace or payment rail.

## Current

- authenticated country/corridor Risk Gate API foundation
- signed machine-readable Risk Objects
- versioned verification and audit contracts

## Planned distribution options

Potential future interfaces include:

- OpenAPI-style developer access
- webhooks
- MCP-compatible adapters
- agent-to-agent interfaces
- marketplace integrations
- x402-compatible machine access/payment where appropriate

These are **PLANNED** unless separately implemented and verified.

A payment/access mechanism must never bypass source-rights restrictions or become part of the core risk calculation methodology.