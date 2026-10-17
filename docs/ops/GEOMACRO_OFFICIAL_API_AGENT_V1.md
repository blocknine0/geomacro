# Geomacro Official API + AI Agent v1 — no-funds release contract

## Single canonical architecture
Already implemented:
- POST \`/api/v1/intelligence/query\`: ONE canonical validated question/subject/topic
  intelligence engine, with source freshness, article rights, signatures, 
  replay/ledger, authorized capability-priced x402 and fail-closed delivery
- POST \`/api/v1/intelligence/{geopolitics,macro-fx,critical-minerals}\`:
  fixed-topic, same core, country-only aliases
- POST \`/api/v1/intelligence/availability\`: no-funds buyer preflight
- GET \`/api/v1/finds[?domain=...]\`: public 15-minute delayed ANNOUNCED/LIMITED
  derived-only Find Cards; not a paid GRO
- \`/api/mcp\`: existing authenticated/guarded JSON-RPC MCP tool discovery and
  the **same** canonical paid tool execution; \`verify_risk_object\` is free 
  integrity-only under its existing public trust registry
- \`/api/a2a\`, \`/.well-known/agent-card.json\`: existing governed task protocol
- \`/ask-geomacro\`: pre-existing hybrid conversational Ask user experience.

## Newly created official versioned agent
- GET \`/api/v1/agent\`: public machine-readable official tool inventory, category
  routing, self-canonical discovery, MCP, A2A, published capability pricing
  imported from \`GEOMACRO_CAPABILITY_PRICES\`. Prices are a schedule, NEVER
  evidence that an endpoint is deliverable or authorized to take real funds.
- GET \`/api/v1/agent?view=openapi\`: machine-readable OpenAPI 3.1 for the
  official agent, canonical category query APIs, buyer preflight and Finds;
  this is **not** a fabricated live availability probe.
- POST \`/api/v1/agent\`: bounded JSON body:
  \`{"tool":"country_risk","arguments":{"country_iso3":"IND","domains":["macro"]}}\`.
  Other existing governed tools: corridor_risk, change_since_last_verified,
  why_changed, three_domain_state, risk_gate_decision_context.
  Validated by the SAME \`geomacroAgentToolToCanonicalQuery\` schemas consumed
  by existing MCP, then forwards once to the in-process canonical POST handler
  using the canonical URL, body and optional original payment-signature.
  **Every** x402 charge and return is decided inside the canonical core;
  no second quote, no new payment rail, no new model, no direct B2/D1 writes.
  If source rights/current evidence are insufficient, the existing canonical
  non-chargeable 422 must pass through unchanged. A canonical 402 must retain
  its original payment binding; POST /api/v1/agent is NOT a substitute payee
  resource URL. Client payment proofs remain bound to canonical
  \`/api/v1/intelligence/query\`.
  For free public verification of a *caller-supplied* signed GRO, use the
  existing MCP \`verify_risk_object\` tool; the agent facade does not create
  a duplicate verifier.
- The central security classifier MUST treat agent POST as \`payment\` and
  GET/OPTIONS as \`public_api\`. Never extend testnet local fallback exceptions
  to this new production alias.

## Frozen founder requirements
- 195x3 ISO registry means *routable*, not 585 currently signed, rights-cleared
  commercial evidence slots; discovery must not claim otherwise.
- Final and immutable capability pricing is imported only from
  \`src/lib/capability-pricing-catalog.ts\`: no extra tiers or increases.
- Raw third-party titles, source names, URLs, private feed payloads, article
  rights proofs and GRO private signing keys are never public deliverables.
- The no-attribution-only paid source rights restriction stays in force.
- x402 real funds remain **OFF** pending genuine current B2/D1/GRO evidence,
  a verified 200 deep health acceptance, and *separate* explicit real-money
  operator ACK. Partner Predge test on 19 October may use verified free Finds,
  discovery, bounded no-charge availability, and signed results ONLY where
  separately real eligible data exists, never a fabricated ready verdict.
- Supabase standby; no paid API/provider, no paid new agent/model engine.

## Verification
1. \`bunx vitest run src/__tests__/official-api-agent-v1.test.ts\`
   validates every official tool mapping and negative no-funds boundaries.
2. Product CI, CodeQL, Website Lock, Commercial Route Inventory, Hosting
   Alignment, exact generated TanStack route tree.
3. Merge protected main, verify exact mirror SHA, owner performs
   **Publish changes**, compare live build marker and
   \`GET /api/v1/agent?view=openapi\`/canonical keys.
4. Optional read-only POST with an intentionally unsupported country/category
   must produce a canonical fail-closed response; never fund an acceptance run.
