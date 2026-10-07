import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GEOMACRO_AGENT_TOOL_NAMES,
  GEOMACRO_MCP_PATH,
  GEOMACRO_MCP_PROTOCOL_VERSION,
  geomacroAgentToolToCanonicalQuery,
} from "../lib/geomacro-agent-tools";
import { geomacroMcpHandlers } from "../lib/geomacro-mcp.server";

const mcpSource = readFileSync("src/lib/geomacro-mcp.server.ts", "utf8");
const routeSource = readFileSync("src/routes/api.mcp.ts", "utf8");

function modernRequest(method: string, params: Record<string, unknown> = {}) {
  const headers = new Headers({
    "content-type": "application/json",
    "mcp-protocol-version": GEOMACRO_MCP_PROTOCOL_VERSION,
    "mcp-method": method,
  });
  if (method === "tools/call" && typeof params.name === "string") {
    headers.set("mcp-name", params.name);
  }
  return new Request("https://geomacro.live/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": GEOMACRO_MCP_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": {
            name: "geomacro-contract-test",
            version: "1.0.0",
          },
        },
      },
    }),
  });
}

describe("Geomacro MCP + thin agent contract", () => {
  it("publishes exactly the seven bounded tools requested for the commercial agent", async () => {
    expect(GEOMACRO_AGENT_TOOL_NAMES).toEqual([
      "country_risk",
      "corridor_risk",
      "change_since_last_verified",
      "why_changed",
      "three_domain_state",
      "risk_gate_decision_context",
      "verify_risk_object",
    ]);

    const response = await geomacroMcpHandlers.POST({
      request: modernRequest("tools/list"),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.result.tools.map((tool: any) => tool.name)).toEqual(
      GEOMACRO_AGENT_TOOL_NAMES,
    );
    expect(body.result.ttlMs).toBe(3_600_000);
    expect(body.result.cacheScope).toBe("public");
    for (const tool of body.result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool._meta["geomacro/executionAuthorized"]).toBe(false);
    }
  });

  it("implements current stateless MCP discovery without a parallel intelligence service", async () => {
    expect(GEOMACRO_MCP_PATH).toBe("/api/mcp");
    const response = await geomacroMcpHandlers.POST({
      request: modernRequest("server/discover"),
    });
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.result.supportedVersions).toEqual(["2026-07-28"]);
    expect(body.result.capabilities.tools.listChanged).toBe(false);
    expect(body.result.instructions).toContain("canonical x402 intelligence API");
    expect(body.result.instructions).toContain("No tool authorizes");
  });

  it("maps country, corridor and three-domain tools into the canonical v1 query schema", () => {
    const country = geomacroAgentToolToCanonicalQuery("country_risk", {
      country_iso3: "ind",
      domains: ["geopolitics", "macro", "critical_minerals"],
    });
    expect(country.subjects).toEqual([{ type: "country", country_iso3: "IND" }]);
    expect(country.intent).toBe("single_subject");
    expect(country.topics).toEqual([
      "conflict_geopolitics",
      "macro_risk",
      "fx_external_risk",
      "critical_minerals",
    ]);

    const corridor = geomacroAgentToolToCanonicalQuery("corridor_risk", {
      origin_country_iso3: "usa",
      destination_country_iso3: "chn",
      domains: ["macro"],
    });
    expect(corridor.subjects).toEqual([
      {
        type: "corridor",
        origin_country_iso3: "USA",
        destination_country_iso3: "CHN",
      },
    ]);
    expect(corridor.intent).toBe("corridor");
    expect(corridor.topics).toEqual([
      "trade_corridor",
      "macro_risk",
      "fx_external_risk",
    ]);

    const all = geomacroAgentToolToCanonicalQuery("three_domain_state", {
      subject: { type: "country", country_iso3: "zaf" },
    });
    expect(all.topics).toEqual([
      "conflict_geopolitics",
      "macro_risk",
      "fx_external_risk",
      "critical_minerals",
    ]);
  });

  it("locks change and cause tools to the previous published verified state", () => {
    for (const name of [
      "change_since_last_verified",
      "why_changed",
    ] as const) {
      const query = geomacroAgentToolToCanonicalQuery(name, {
        subject: { type: "country", country_iso3: "DEU" },
      });
      expect(query.intent).toBe("change_since");
      expect(query.change).toEqual({ baseline: "previous_published" });
    }
  });

  it("keeps Risk Gate context explicitly non-executing and canonical", () => {
    const query = geomacroAgentToolToCanonicalQuery(
      "risk_gate_decision_context",
      {
        subject: { type: "country", country_iso3: "IND" },
        action_type: "exposure_review",
        policy_preset: "strict",
        amount_usdc: 2500,
      },
    );
    expect(query.intent).toBe("risk_gate");
    expect(query.topics).toContain("risk_gate");
    expect(query.topics).toContain("risk_object");
    expect(query.risk_gate_context).toEqual({
      policy_preset: "strict",
      action_type: "exposure_review",
      amount_usdc: 2500,
    });
  });

  it("adapts MCP paid calls to the exact canonical commercial handler", () => {
    expect(routeSource).toContain('createFileRoute("/api/mcp")');
    expect(routeSource).toContain("geomacroMcpHandlers");
    expect(mcpSource).toContain("mainnetIntelligenceHandlers.POST");
    expect(mcpSource).toContain("CANONICAL_MAINNET_INTELLIGENCE_PATH");
    expect(mcpSource).toContain('type: "mcp"');
    expect(mcpSource).toContain('transport: "streamable-http"');
    expect(mcpSource).toContain('url: `mcp://geomacro/${toolName}`');
    expect(mcpSource).toContain("encodeX402Header(transformed)");
    expect(mcpSource).not.toContain("assembleAgentQueryResponse");
    expect(mcpSource).not.toContain("requireRiskSupabase");
    expect(mcpSource).not.toContain("settleCoinbaseX402");
  });

  it("rejects modern MCP header/body mismatches fail closed", async () => {
    const request = modernRequest("tools/list");
    const badHeaders = new Headers(request.headers);
    badHeaders.set("mcp-method", "tools/call");
    const response = await geomacroMcpHandlers.POST({
      request: new Request(request.url, {
        method: "POST",
        headers: badHeaders,
        body: await request.text(),
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error.code).toBe(-32020);
  });
});
