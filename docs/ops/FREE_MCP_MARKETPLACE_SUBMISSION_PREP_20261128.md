# Free MCP marketplace submission preparation — 2026-11-28

Status: **PREPARED DRAFT / PUBLIC SUBMISSION ON HOLD**

This document prepares the existing Geomacro MCP endpoint for zero-budget distribution. It does not publish the service, change production payment gates, create another intelligence engine, add hosting, or authorize public claims that a marketplace listing exists.

## 1. Current implementation verified on main

Repository: `blocknine0/geomacro`  
Default branch: `main`  
Inspected main commit: `87d4c5154691bbeca87552848aab50406aecab54`  
Inspection date: 2026-11-28

The repository already contains an MCP server. **Do not create a second MCP server or duplicate the intelligence engine.**

Verified source files:

- `src/routes/api.mcp.ts` mounts `geomacroMcpHandlers` at `/api/mcp`.
- `src/lib/geomacro-mcp.server.ts` implements JSON-RPC Streamable HTTP handling, `server/discover`, `tools/list`, and `tools/call`.
- `src/lib/geomacro-agent-tools.ts` defines the shared tool schemas and maps paid tool arguments through `geomacroAgentToolToCanonicalQuery`.
- Paid MCP tool calls invoke the existing `mainnetIntelligenceHandlers.POST` canonical handler. The adapter does not own a second evidence engine, response assembler, settlement implementation, or Supabase intelligence read path.
- `src/__tests__/geomacro-mcp-agent-tools.test.ts` covers discovery, tool inventory, canonical query mapping, protocol headers, and fail-closed boundaries.
- The MCP implementation was introduced by merged PR #1722 (merge commit `282767b483b9bd512bbcdc610250c03599c91cbd`).

The current tool inventory contains 13 tools, including `answer_question`, `geopolitics_query`, `macro_fx_query`, `critical_minerals_query`, `country_risk`, `corridor_risk`, `three_domain_state`, and the read-only `verify_risk_object` utility. The paid tools still pass through the canonical intelligence/payment gates.

Canonical expected remote endpoint: `https://geomacro.live/api/mcp`.

**Live endpoint status: NOT VERIFIED in this preparation.** A source-code route and passing repository tests do not prove that the current production deployment serves this exact MCP build. The production endpoint must pass external protocol tests before any submission.

## 2. Mandatory pre-submission checks

The current implementation advertises MCP protocol version `2026-07-28`, which is a real MCP specification release. The current handler code inspection also identified two transport-security/interoperability checks that must be closed before public listing:

1. The Streamable HTTP specification requires Origin validation when an Origin header is present. The inspected MCP handler sets wildcard CORS headers but no explicit Origin validation was found in that handler.
2. The Streamable HTTP specification requires clients to send an Accept header listing both `application/json` and `text/event-stream`. The inspected handler parses Content-Type but no explicit Accept-header validation was found.

These are code-review findings, not proof that an upstream middleware does or does not cover them. Confirm the complete request path and add focused regression tests before declaring transport compliance.

Additional release checks:

- Verify deployed `POST https://geomacro.live/api/mcp` responds to a current `server/discover` request with protocol metadata.
- Verify `tools/list` returns the expected 13 tools and accurate descriptions.
- Verify the free `verify_risk_object` tool is read-only and does not authorize execution.
- Verify paid calls preserve the canonical x402 402 challenge and do not charge on unavailable/422 results.
- Verify the production endpoint has no testnet, sandbox, or development bypass.
- Confirm the exact deployed build/commit corresponds to the reviewed main implementation.
- Do not run a real payment or enable production funds as part of listing preparation.

## 3. Official MCP Registry — remote-only metadata draft

The official registry supports remote-only Streamable HTTP servers using a `remotes` entry; a package or separate hosting service is not required. Publishing is performed with the official `mcp-publisher` CLI, not by opening a PR to the registry repository.

Proposed `server.json` (draft only; do not publish until the live endpoint checks above pass):

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.blocknine0/geomacro",
  "title": "Geomacro Global Intelligence",
  "description": "On-demand geopolitical, macro/FX and critical-minerals intelligence for AI agents.",
  "repository": {
    "url": "https://github.com/blocknine0/geomacro",
    "source": "github"
  },
  "version": "1.0.0",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://geomacro.live/api/mcp"
    }
  ]
}
```

Namespace rationale: GitHub publisher authentication for the `blocknine0` account permits the `io.github.blocknine0/` namespace. The registry stores metadata only; it does not host the MCP server.

Owner-side publication sequence after release approval:

```bash
mcp-publisher validate server.json
mcp-publisher login github
mcp-publisher publish server.json
```

Then verify the exact entry through the official registry API:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.blocknine0/geomacro"
```

The publisher login/publish commands require the owner to authenticate in their own environment. No credentials belong in this repository or in chat.

## 4. Glama — free connector/discovery preparation

Preferred path: publish the verified remote server to the Official MCP Registry first. Glama documents that it imports published Streamable HTTP registry endpoints on an hourly schedule. After import, claim the listing using the GitHub/domain/endpoint verification flow.

Alternative: submit a hosted connector directly at Glama using:

- Name: Geomacro Global Intelligence
- Endpoint: `https://geomacro.live/api/mcp`
- Transport: Streamable HTTP
- Description: On-demand geopolitical, macro/FX and critical-minerals intelligence for AI agents.
- Repository: `https://github.com/blocknine0/geomacro`

Do not submit the monorepo as an independently installable open-source MCP package: the repository license is proprietary. Use the hosted-connector path only after the production endpoint is externally reachable and its tool inventory can be health-checked.

Glama health-check credentials, if ever required, must be a dedicated least-privilege test profile. Never provide a personal/admin credential or a credential capable of billable paid calls.

## 5. Cline Marketplace — free catalog entry draft

The current Cline marketplace repository uses one entry per folder at `registry/mcps/<slug>/entry.json`, with a pull request to `cline/marketplace`. Its install command is rendered from the `install.args` array.

Proposed entry (draft only; submit only after Cline connectivity and payment-boundary tests):

```json
{
  "$schema": "../../../schemas/mcp.schema.json",
  "id": "geomacro",
  "type": "mcp",
  "name": "Geomacro",
  "tagline": "Global geopolitical, macro/FX and critical-minerals intelligence",
  "description": "A remote MCP server for structured geopolitical, macro/FX and critical-minerals intelligence. Tool discovery is public; paid intelligence tools require the canonical Geomacro x402 payment flow. Unavailable or unqualified requests must remain non-chargeable. Geomacro is read-only and never authorizes financial execution.",
  "author": {
    "name": "Geomacro",
    "url": "https://geomacro.live"
  },
  "homepage": "https://geomacro.live",
  "repo": "https://github.com/blocknine0/geomacro",
  "tags": ["research", "data", "finance"],
  "license": "Proprietary",
  "verified": false,
  "featured": false,
  "install": {
    "args": ["geomacro", "--transport", "http", "https://geomacro.live/api/mcp"],
    "notes": "Connects to the remote Geomacro MCP endpoint. Paid intelligence tools require an MCP client capable of completing Geomacro's x402 payment challenge. Do not assume a normal Cline installation can automatically pay. Verify the free read-only verification tool and payment failure behavior before use."
  }
}
```

Cline's current marketplace schema accepts a string license label; the value above accurately reflects the Geomacro repository's proprietary license. Do not label the repository MIT, Apache, or open source.

**Cline-specific blocker:** a successful MCP connection does not prove that Cline can complete x402 payments. Unless a supported Cline payment flow is verified, do not market paid tool execution as working in Cline. The listing may be deferred even if basic tool discovery works.

Submission destination: `https://github.com/cline/marketplace`  
Target path: `registry/mcps/geomacro/entry.json`  
Submission type: pull request to the marketplace repository.

## 6. Submission state and owner actions

| Target | Preparation | Public status |
|---|---|---|
| Official MCP Registry | Remote-only `server.json` draft above | Hold: live endpoint not verified |
| Glama | Hosted connector details prepared; registry import preferred | Hold: endpoint and health check not verified |
| Cline Marketplace | Current catalog entry draft above | Hold: Cline x402 payment compatibility not verified |

No marketplace submission has been made by this document. No paid service, paid API, paid hosting, Supabase, or duplicate intelligence engine is introduced.

Release gate: the owner must approve public listing after the deployed endpoint, transport security, tool inventory, canonical 402/422 behavior, and client compatibility have been independently verified. Marketplace acceptance and live listing must then be recorded separately; a submitted PR or registry publish command alone is not proof of listing or customer usage.

## 7. References

- Official Registry remote server quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- Official Registry remote server transport: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/remote-servers.mdx
- MCP 2026-07-28 Streamable HTTP specification: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/transports/streamable-http.mdx
- Glama submission and connector FAQ: https://glama.ai/mcp/faq
- Cline marketplace contribution instructions: https://github.com/cline/marketplace
