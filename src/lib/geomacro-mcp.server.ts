import { ZodError } from "zod";
import {
  encodeX402Header,
} from "./coinbase-x402.server";
import { mainnetIntelligenceHandlers } from "./mainnet-intelligence-endpoint.server";
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
import { callCanonicalWithSourceResearchFallback } from "./answer-question-source-fallback.server";
import { isSourceGroundedResearchAnswer } from "./on-demand-research-answer.server";
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

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  GEOMACRO_MCP_PROTOCOL_VERSION,
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

function validateOriginAndAccept(request: Request, id: JsonRpcId) {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(origin);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
      return rpcError(id, -32020, "Invalid Origin header", undefined, 403);
    }
  }
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  if (
    accept.length > 0 &&
    !accept.includes("application/json") &&
    !accept.includes("text/event-stream") &&
    !accept.includes("*/*") &&
    !accept.includes("application/*")
  ) {
    return rpcError(
      id,
      -32020,
      "Accept header must allow application/json or text/event-stream",
      undefined,
      406,
    );
  }
  return null;
}

function validateModernHeaders(request: Request, body: Record<string, unknown>) {
  const id = requestId(body);
  const originOrAcceptErr = validateOriginAndAccept(request, id);
  if (originOrAcceptErr) return originOrAcceptErr;

  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && version !== "" && !SUPPORTED_PROTOCOL_VERSIONS.has(version)) {
    return rpcError(
      id,
      -32022,
      "Unsupported MCP protocol version",
      { supported: [...SUPPORTED_PROTOCOL_VERSIONS] },
      400,
    );
  }

  const method = typeof body.method === "string" ? body.method : "";
  const headerMethod = request.headers.get("mcp-method");
  if (headerMethod !== null && headerMethod !== method) {
    return rpcError(
      id,
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
    (typeof envelopeVersion !== "string" || !SUPPORTED_PROTOCOL_VERSIONS.has(envelopeVersion))
  ) {
    return rpcError(
      id,
      -32020,
      "MCP protocol version envelope does not match transport header",
      undefined,
      400,
    );
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "";
    const headerName = request.headers.get("mcp-name");
    if (!name || (headerName !== null && headerName !== name)) {
      return rpcError(
        id,
        -32020,
        "Mcp-Name header does not match tools/call params.name",
        undefined,
        400,
      );
    }
  }

  return null;
}

const MCP_TOOL_USAGE_GUIDANCE: Record<string, string> = {
  store_product_query: "Use when you already know the exact Geomacro Store SKU (capability and variant) and structured subjects. Do not use for free-form natural-language questions (use answer_question or paid_structured_answer instead). Paid via x402 USDC; read-only and never authorizes execution.",
  paid_structured_answer: "Use when you have a free-form multilingual question and want deterministic Store SKU selection with x402 USDC delivery. Do not use for free signature verification (use verify_risk_object) or domain-locked single-country queries (use geopolitics_query, macro_fx_query, or critical_minerals_query). Read-only; never authorizes execution.",
  answer_question: "Use when asking a concise English natural-language question (up to 1000 chars) naming one or more unambiguous countries without choosing a SKU. Do not use for directional trade corridors (use corridor_risk) or pre-payment policy gates (use risk_gate_decision_context). Paid via x402 USDC; never charges when unavailable.",
  geopolitics_query: "Geomacro Geopolitics Agent: use when asking a focused geopolitics or conflict question for a single country (ISO3). Do not use for cross-domain summaries (use country_risk or three_domain_state) or cross-border corridors (use corridor_risk). Live retrieval is no-charge until commercially verified; published_only uses x402 USDC.",
  macro_fx_query: "Geomacro Macro / FX Agent: use when asking a focused macroeconomic, inflation, or currency question for a single country (ISO3). Do not use for cross-domain summaries (use country_risk or three_domain_state) or cross-border corridors (use corridor_risk). Live retrieval is no-charge until commercially verified; published_only uses x402 USDC.",
  critical_minerals_query: "Geomacro Critical Minerals Agent: use when asking a focused critical-minerals or supply-chain question for a single country (ISO3). Do not use for cross-domain summaries (use country_risk or three_domain_state) or cross-border corridors (use corridor_risk). Live retrieval is no-charge until commercially verified; published_only uses x402 USDC.",
  country_risk: "Use when you need the current derived risk state for a single country across selected domains without writing a free-form question. Do not use for bilateral corridors (use corridor_risk) or change attribution (use change_since_last_verified or why_changed). Paid via x402 USDC; never returns raw upstream data.",
  corridor_risk: "Use when assessing directional cross-border risk from an origin country to a destination country (trade, supply chain, or settlement corridor). Do not use for single-country queries (use country_risk). Paid via x402 USDC; read-only.",
  change_since_last_verified: "Use when checking what materially changed since the previous published verified state for a country or corridor. Do not use if you only need the current baseline snapshot (use country_risk or three_domain_state) or causal drivers (use why_changed). Paid via x402 USDC.",
  why_changed: "Use when investigating the specific drivers and causes behind the latest verified risk-state change for a country or corridor. Do not use for current static risk levels (use country_risk) or pre-payment policy gates (use risk_gate_decision_context). Paid via x402 USDC.",
  three_domain_state: "Use when you want a unified snapshot across all three Geomacro domains (geopolitics, macro/FX, and critical minerals) for a country or corridor. Do not use when filtering to a single domain (use country_risk or a category *_query tool). Paid via x402 USDC.",
  risk_gate_decision_context: "Use before a treasury, vendor, or agent payment or exposure review to obtain a policy-aware, non-executing Risk Gate decision context (CONTINUE, REDUCE_LIMIT, REQUIRE_APPROVAL, or PAUSE). Do not use for general news summaries. Paid via x402 USDC; execution_authorized is always false.",
  verify_risk_object: "Use when verifying the Ed25519 signature and integrity of a signed Geomacro Risk Object already in your possession. Free (no payment required) and read-only; verifies cryptographic authenticity only and never authorizes execution.",
};

const MCP_PARAM_DESCRIPTIONS: Record<string, string> = {
  question: "Natural-language risk intelligence question naming the target country, corridor, or topic.",
  language: "Optional BCP47 response language code (for example, en, es, fr).",
  country_iso3: "Uppercase 3-letter ISO 3166-1 alpha-3 country code (for example, USA, IND, CHN, DEU).",
  origin_country_iso3: "Origin uppercase 3-letter ISO 3166-1 alpha-3 country code.",
  destination_country_iso3: "Destination uppercase 3-letter ISO 3166-1 alpha-3 country code (must differ from origin).",
  domains: "Risk domains to include: geopolitics, macro, and/or critical_minerals.",
  topics: "Risk topic filters to narrow analysis scope.",
  subjects: "Target countries or directional corridors for analysis.",
  subject: "Target entity: either a single country (type=country) or a directional corridor (type=corridor).",
  type: "Subject selector type (country or corridor).",
  max_age_seconds: "Optional maximum acceptable intelligence age in seconds before rejecting stale state.",
  detail: "Response verbosity level: compact (summary), standard (default), or full (detailed drivers).",
  client_request_id: "Optional caller-supplied idempotency key (4 to 128 characters) for tracking or retries.",
  fulfillment_mode: "Use live_on_demand (default) for fresh verified retrieval or published_only for cached signed intelligence.",
  product: "Selected Geomacro Store SKU (capability and variant).",
  capability: "Target Geomacro Store capability identifier.",
  variant: "Target product variant (for example, standard or complex).",
  issued_after: "Optional ISO 8601 lower-bound timestamp for source freshness.",
  policy_preset: "Risk tolerance preset: balanced (default), cautious, or strict.",
  action_type: "Intended downstream action type being evaluated by the Risk Gate.",
  amount_usdc: "Optional transaction exposure amount in USDC (positive number) for sizing context.",
  risk_object: "Complete signed Geomacro Risk Object JSON payload supplied by the caller.",
  schema_version: "Schema version identifier for the query payload.",
  intent: "Structured query intent (single_subject, corridor, change_since, or risk_gate).",
  evidence: "Evidence requirement mode.",
  delivery_tier: "Target signed delivery tier.",
  change: "Change-comparison baseline configuration.",
  risk_gate_context: "Policy preset and action context for Risk Gate evaluation.",
};

function enrichSchemaDescriptions(node: unknown, propName?: string): unknown {
  if (Array.isArray(node)) return node.map((item) => enrichSchemaDescriptions(item));
  if (!isRecord(node)) return node;
  const out: Record<string, unknown> = { ...node };
  if (propName && typeof out.description !== "string" && MCP_PARAM_DESCRIPTIONS[propName]) {
    out.description = MCP_PARAM_DESCRIPTIONS[propName];
  }
  if (isRecord(out.properties)) {
    const nextProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out.properties)) {
      nextProps[k] = enrichSchemaDescriptions(v, k);
    }
    out.properties = nextProps;
  }
  if (out.items) out.items = enrichSchemaDescriptions(out.items);
  if (Array.isArray(out.oneOf)) out.oneOf = out.oneOf.map((x) => enrichSchemaDescriptions(x));
  if (Array.isArray(out.anyOf)) out.anyOf = out.anyOf.map((x) => enrichSchemaDescriptions(x));
  return out;
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

  // The shared adapter still posts to CANONICAL_MAINNET_INTELLIGENCE_PATH; it only adds a no-charge research fallback after canonical refusal.
  const canonicalResponse = await callCanonicalWithSourceResearchFallback({
    request,
    toolName,
    query: canonicalQuery,
    canonicalPost: mainnetIntelligenceHandlers.POST,
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
    // A verified-original-page research answer is a successful, explicitly
    // non-chargeable result. It is not a signed or commercially admitted product.
    const researchOnly = isSourceGroundedResearchAnswer(payload);
    const resultPayload = researchOnly
      ? {...(payload as Record<string, unknown>), error: undefined, ok: true, delivery_status: "RESEARCH_ONLY", research_only_reason: "Independent same-event corroboration, commercial rights and signing remain unverified."}
      : payload;
    return responseWithCanonicalHeaders(
      toolResult(id, resultPayload, !researchOnly),
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

    if (raw.method === "initialize") {
      const requestedVersion =
        typeof params.protocolVersion === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.has(params.protocolVersion)
          ? params.protocolVersion
          : GEOMACRO_MCP_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: requestedVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "geomacro",
          version: GEOMACRO_MCP_SERVER_VERSION,
        },
        instructions:
          "Geomacro is a read-only geopolitical, macro/FX and critical-minerals intelligence agent. Paid intelligence tools route through the canonical x402 intelligence API. No tool authorizes trading, payments or financial execution.",
      });
    }

    if (raw.method === "notifications/initialized" || raw.method.startsWith("notifications/")) {
      return new Response(null, { status: 202, headers: corsHeaders });
    }

    if (raw.method === "ping") {
      return rpcResult(id, {});
    }

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
        resultType: "complete",
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
