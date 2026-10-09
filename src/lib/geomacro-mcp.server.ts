import { ZodError } from "zod";
import {
  encodeX402Header,
} from "./coinbase-x402.server";
import {
  CANONICAL_MAINNET_INTELLIGENCE_PATH,
  mainnetIntelligenceHandlers,
} from "./mainnet-intelligence-endpoint.server";
import {
  GEOMACRO_AGENT_TOOLS,
  GEOMACRO_MCP_PATH,
  GEOMACRO_MCP_PROTOCOL_VERSION,
  GEOMACRO_MCP_SERVER_VERSION,
  geomacroAgentTool,
  geomacroAgentToolToCanonicalQuery,
  verifyRiskObjectToolSchema,
  type GeomacroAgentToolName,
} from "./geomacro-agent-tools";
import {
  assertRiskObjectJsonKeysSafe,
} from "./risk-object-signing.server";
import {
  ensureRiskObjectRuntimePublicKey,
} from "./risk-object-runtime-public-key.server";
import {
  verifyPublicRiskObjectArtifact,
} from "./risk-object-verification.server";

const MAX_MCP_BODY_BYTES = 64 * 1024;
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Accept",
    "MCP-Protocol-Version",
    "Mcp-Method",
    "Mcp-Name",
    "PAYMENT-SIGNATURE",
    "payment-signature",
  ].join(", "),
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Access-Control-Max-Age": "600",
};

type JsonRpcId = string | number | null;

function serverMeta() {
  return {
    [SERVER_INFO_META_KEY]: {
      name: "geomacro",
      version: GEOMACRO_MCP_SERVER_VERSION,
    },
  };
}

function json(
  payload: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function rpcResult(id: JsonRpcId, result: Record<string, unknown>) {
  return json({
    jsonrpc: "2.0",
    id,
    result: {
      ...result,
      _meta: {
        ...(typeof result._meta === "object" && result._meta && !Array.isArray(result._meta)
          ? result._meta
          : {}),
        ...serverMeta(),
      },
    },
  });
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
  status = 200,
) {
  return json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data }),
      },
    },
    status,
  );
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_MCP_BODY_BYTES) {
    throw new Response("MCP request body too large", { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_MCP_BODY_BYTES) {
    throw new Response("MCP request body too large", { status: 413 });
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Response("MCP request body is not valid JSON", { status: 400 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requestId(value: unknown): JsonRpcId {
  if (!isRecord(value)) return null;
  return typeof value.id === "string" || typeof value.id === "number" || value.id === null
    ? value.id
    : null;
}

function validateModernHeaders(request: Request, body: Record<string, unknown>) {
  const version = request.headers.get("mcp-protocol-version");
  if (version !== GEOMACRO_MCP_PROTOCOL_VERSION) {
    return rpcError(
      requestId(body),
      -32022,
      "Unsupported MCP protocol version",
      { supported: [GEOMACRO_MCP_PROTOCOL_VERSION] },
      400,
    );
  }

  const method = typeof body.method === "string" ? body.method : "";
  if (request.headers.get("mcp-method") !== method) {
    return rpcError(
      requestId(body),
      -32020,
      "Mcp-Method header does not match JSON-RPC method",
      undefined,
      400,
    );
  }

  const params = isRecord(body.params) ? body.params : {};
  const meta = isRecord(params._meta) ? params._meta : {};
  const envelopeVersion = meta[PROTOCOL_VERSION_META_KEY];
  if (
    envelopeVersion !== undefined &&
    envelopeVersion !== GEOMACRO_MCP_PROTOCOL_VERSION
  ) {
    return rpcError(
      requestId(body),
      -32020,
      "MCP protocol version envelope does not match transport header",
      undefined,
      400,
    );
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    if (!name || request.headers.get("mcp-name") !== name) {
      return rpcError(
        requestId(body),
        -32020,
        "Mcp-Name header does not match tools/call params.name",
        undefined,
        400,
      );
    }
  }

  return null;
}

function publicTools() {
  return GEOMACRO_AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.name
      .split("_")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    _meta: {
      "geomacro/paid": tool.paid,
      "geomacro/executionAuthorized": false,
      "geomacro/deliveryBoundary": tool.paid
        ? "STRUCTURED_DERIVED_INTELLIGENCE_ONLY"
        : "SIGNED_RISK_OBJECT_VERIFICATION_ONLY",
    },
  }));
}

function mcpBazaarExtension(
  tool: (typeof GEOMACRO_AGENT_TOOLS)[number],
  existing: unknown,
) {
  const base = isRecord(existing) ? existing : {};
  return {
    ...base,
    bazaar: {
      info: {
        input: {
          type: "mcp",
          toolName: tool.name,
          inputSchema: tool.inputSchema,
          description: tool.description,
          transport: "streamable-http",
          example: tool.example,
        },
        output: {
          type: "json",
          example: {
            schema_version: "geomacro.adaptive-intelligence-response.v1",
            product: "geomacro_adaptive_risk_intelligence_v1",
            delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY",
            raw_data_delivered: false,
            source_identity_delivered: false,
            execution_authorized: false,
          },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { const: "mcp" },
              toolName: { const: tool.name },
              inputSchema: { type: "object" },
              description: { type: "string" },
              transport: { const: "streamable-http" },
              example: { type: "object" },
            },
            required: ["type", "toolName", "inputSchema", "transport"],
          },
          output: { type: "object" },
        },
        required: ["input"],
      },
    },
  };
}

async function mcpPaymentRequired(
  canonicalResponse: Response,
  request: Request,
  toolName: GeomacroAgentToolName,
) {
  const tool = geomacroAgentTool(toolName);
  if (!tool) return canonicalResponse;

  let paymentRequired: unknown;
  try {
    paymentRequired = await canonicalResponse.json();
  } catch {
    return rpcError(null, -32603, "Canonical payment challenge was not valid JSON", undefined, 503);
  }
  if (!isRecord(paymentRequired)) {
    return rpcError(null, -32603, "Canonical payment challenge was malformed", undefined, 503);
  }

  const resource = isRecord(paymentRequired.resource) ? paymentRequired.resource : {};
  const transformed = {
    ...paymentRequired,
    resource: {
      ...resource,
      url: `mcp://geomacro/${toolName}`,
      description: tool.description,
      mimeType: "application/json",
      serviceName: "Geomacro",
    },
    extensions: mcpBazaarExtension(tool, paymentRequired.extensions),
  };

  const headers = Object.fromEntries(canonicalResponse.headers.entries());
  headers["PAYMENT-REQUIRED"] = encodeX402Header(transformed);
  headers["X-Geomacro-MCP-Endpoint"] = new URL(GEOMACRO_MCP_PATH, request.url).toString();
  return json(transformed, 402, headers);
}

function toolResult(id: JsonRpcId, structuredContent: unknown, isError = false) {
  const textContent =
    typeof structuredContent === "string"
      ? structuredContent
      : JSON.stringify(structuredContent);
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: textContent }],
      structuredContent,
      isError,
      _meta: {
        ...serverMeta(),
        "geomacro/executionAuthorized": false,
      },
    },
  };
}

function responseWithCanonicalHeaders(
  payload: unknown,
  canonicalResponse: Response,
) {
  const responseHeaders: Record<string, string> = {};
  const paymentResponse = canonicalResponse.headers.get("payment-response");
  if (paymentResponse) responseHeaders["PAYMENT-RESPONSE"] = paymentResponse;
  return json(payload, 200, responseHeaders);
}

async function callVerifyRiskObject(id: JsonRpcId, rawArguments: unknown) {
  try {
    const input = verifyRiskObjectToolSchema.parse(rawArguments);
    assertRiskObjectJsonKeysSafe(input.risk_object);
    ensureRiskObjectRuntimePublicKey();
    const verification = verifyPublicRiskObjectArtifact(input.risk_object);
    const payload = {
      ok: verification.valid,
      verification,
      execution_authorized: false,
    };
    return json(toolResult(id, payload, !payload.ok));
  } catch (error) {
    if (error instanceof ZodError) {
      return rpcError(
        id,
        -32602,
        "Invalid verify_risk_object arguments",
        error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    return responseWithCanonicalHeaders(
      toolResult(
        id,
        {
          ok: false,
          error: "Risk Object verification failed",
          execution_authorized: false,
        },
        true,
      ),
      new Response(null),
    );
  }
}

async function callPaidTool(
  request: Request,
  id: JsonRpcId,
  toolName: Exclude<GeomacroAgentToolName, "verify_risk_object">,
  rawArguments: unknown,
) {
  let canonicalQuery;
  try {
    canonicalQuery = geomacroAgentToolToCanonicalQuery(toolName, rawArguments);
  } catch (error) {
    if (error instanceof ZodError) {
      return rpcError(
        id,
        -32602,
        `Invalid ${toolName} arguments`,
        error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    return rpcError(
      id,
      -32602,
      error instanceof Error ? error.message : "Tool arguments could not be mapped safely",
    );
  }

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const canonicalRequest = new Request(
    new URL(CANONICAL_MAINNET_INTELLIGENCE_PATH, request.url),
    {
      method: "POST",
      headers,
      body: JSON.stringify(canonicalQuery),
    },
  );

  const canonicalResponse = await mainnetIntelligenceHandlers.POST({
    request: canonicalRequest,
  });

  if (canonicalResponse.status === 402) {
    return mcpPaymentRequired(canonicalResponse, request, toolName);
  }

  let payload: unknown;
  try {
    payload = await canonicalResponse.json();
  } catch {
    return rpcError(id, -32603, "Canonical intelligence response was not valid JSON");
  }

  if (!canonicalResponse.ok) {
    return responseWithCanonicalHeaders(
      toolResult(id, payload, true),
      canonicalResponse,
    );
  }

  return responseWithCanonicalHeaders(
    toolResult(id, payload, false),
    canonicalResponse,
  );
}

export const geomacroMcpHandlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
  GET: async () =>
    json(
      {
        ok: false,
        error: "MCP Streamable HTTP uses POST for server/discover, tools/list and tools/call.",
        protocol_version: GEOMACRO_MCP_PROTOCOL_VERSION,
        execution_authorized: false,
      },
      405,
      { Allow: "POST, OPTIONS" },
    ),
  POST: async ({ request }: { request: Request }) => {
    let raw: unknown;
    try {
      raw = await parseBody(request);
    } catch (error) {
      if (error instanceof Response) {
        return rpcError(null, -32700, await error.text(), undefined, error.status);
      }
      throw error;
    }

    if (!isRecord(raw) || raw.jsonrpc !== "2.0" || typeof raw.method !== "string") {
      return rpcError(requestId(raw), -32600, "Invalid JSON-RPC request", undefined, 400);
    }

    const headerError = validateModernHeaders(request, raw);
    if (headerError) return headerError;

    const id = requestId(raw);
    const params = isRecord(raw.params) ? raw.params : {};

    if (raw.method === "server/discover") {
      return rpcResult(id, {
        supportedVersions: [GEOMACRO_MCP_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        instructions:
          "Geomacro is a read-only geopolitical, macro/FX and critical-minerals intelligence agent. Paid intelligence tools route through the canonical x402 intelligence API. No tool authorizes trading, payments or financial execution.",
        ttlMs: 3_600_000,
        cacheScope: "public",
      });
    }

    if (raw.method === "tools/list") {
      return rpcResult(id, {
        tools: publicTools(),
        ttlMs: 3_600_000,
        cacheScope: "public",
      });
    }

    if (raw.method === "tools/call") {
      const name = typeof params.name === "string" ? params.name : "";
      const tool = geomacroAgentTool(name);
      if (!tool) {
        return rpcError(id, -32602, "Unknown Geomacro tool", { name });
      }
      const args = params.arguments ?? {};

      if (tool.name === "verify_risk_object") {
        return callVerifyRiskObject(id, args);
      }

      return callPaidTool(request, id, tool.name, args);
    }

    return rpcError(id, -32601, "Method not found", { method: raw.method });
  },
};
