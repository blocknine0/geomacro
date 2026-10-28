import { AGENT_QUERY_TOPICS, AGENT_QUERY_INTENTS } from "./agent-query-plan";
import { GEOMACRO_API_EXAMPLES } from "./public-api-endpoints";
import { publicCapabilityPricingCatalog } from "./capability-pricing-catalog";

export function storeProductOpenApiSchema() {
  return { oneOf: publicCapabilityPricingCatalog().flatMap(row => row.variants.map(price => {
    const newlyIssued = price.capability === "signed_risk_object" && price.variant === "newly_qualified_signed";
    return { type: "object", additionalProperties: false,
      required: newlyIssued ? ["capability", "variant", "issued_after"] : ["capability", "variant"],
      properties: { capability: { const: price.capability }, variant: { const: price.variant },
        ...(newlyIssued ? { issued_after: { type: "string", format: "date-time", description: "Current UTC cutoff, no older than five minutes when requesting a new quote. Requires an actually signature-verified publication after this cutoff; never generates a signature." } } : {}) },
    };
  })) };
}

const iso3 = { type: "string", pattern: "^[A-Z]{3}$", example: "IND" };
const country = { type: "object", required: ["type", "country_iso3"], properties: {
  type: { const: "country" }, country_iso3: iso3,
} };
const corridor = { type: "object", required: ["type", "origin_country_iso3", "destination_country_iso3"], properties: {
  type: { const: "corridor" }, origin_country_iso3: iso3, destination_country_iso3: iso3,
}, description: "Origin and destination must differ." };

export function publicQueryOpenApiSchema(topics?: readonly string[]) {
  return {
    type: "object", additionalProperties: false, required: ["subjects"],
    description: topics ? "Country-only category query; topics are bound by the server. Question must remain within the category."
      : "Provide topics, intent or a classifiable question. Subject routing does not establish current verified coverage.",
    properties: {
      product: storeProductOpenApiSchema(),
      schema_version: { const: "geomacro.agent-query.v1" },
      subjects: { type: "array", minItems: 1, maxItems: topics ? 1 : 25,
        items: topics ? country : { oneOf: [country, corridor] } },
      question: { type: "string", minLength: 3, maxLength: 2000 },
      response_locale: { type:"string",enum:["en","bn","hi"],description:"Optional paid response language; changes query and frozen payment hash only when set. Default English." },
      topics: topics ? { type: "array", minItems: topics.length, maxItems: topics.length, uniqueItems: true, items: { enum: [...topics] } }
        : { type: "array", maxItems: 16, items: { enum: [...AGENT_QUERY_TOPICS] } },
      intent: topics ? { const: "single_subject" } : { enum: [...AGENT_QUERY_INTENTS] },
      ranking: { type: "object", additionalProperties: false, required: ["metric"], properties: {
        metric: { const: "risk_object_score" }, order: { enum: ["high_to_low", "low_to_high"], default: "high_to_low" },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      } },
      change: { type: "object", additionalProperties: false, required: ["baseline"], properties: { baseline: { const: "previous_published" } } },
      as_of: { type: "string", format: "date-time" },
      max_age_seconds: { type: "integer", minimum: 1, maximum: 94608000,
        description: "May only tighten the source-native module freshness policy." },
      evidence: { enum: ["required", "summary"], default: "required" },
      detail: { enum: ["compact", "standard", "full"], default: "standard" },
      fulfillment_mode: { enum: ["published_only", "live_on_demand"], default: topics ? "live_on_demand" : "published_only" },
      delivery_tier: { enum: ["signed_risk_intelligence", "structural_baseline"], default: "signed_risk_intelligence" },
      risk_gate_context: { type: "object", additionalProperties: false, required: ["action_type"], properties: {
        policy_preset: { enum: ["balanced", "cautious", "strict"], default: "balanced" },
        action_type: { enum: ["treasury_payment", "vendor_payment", "agent_payment", "exposure_review"] },
        amount_usdc: { type: "number", exclusiveMinimum: 0, maximum: 1000000000 },
      } },
      client_request_id: { type: "string", minLength: 4, maxLength: 128 },
    },
  };
}

export function baselineOpenApiSchema() {
  const base = publicQueryOpenApiSchema();
  const { ranking: _ranking, change: _change, as_of: _asOf, risk_gate_context: _riskGate, ...properties } = base.properties;
  return { ...base, description: "Historical structural baseline only. Legacy requests use one country/topic; explicit product supports a country/corridor digest or a full profile with two or more verified dimensions. Not current signed risk.",
    required: ["subjects", "topics", "delivery_tier"], properties: {
      ...properties,
      subjects: { type: "array", minItems: 1, maxItems: 1, items: { oneOf: [country, corridor] } },
      topics: { type: "array", minItems: 1, maxItems: 5, uniqueItems: true, items: { enum: ["sovereign_risk", "macro_risk", "fx_external_risk", "critical_minerals", "conflict_geopolitics"] } },
      fulfillment_mode: { const: "published_only", default: "published_only" },
      delivery_tier: { const: "structural_baseline" },
      intent: { enum: ["single_subject", "corridor"] },
    },
    allOf: [{ if: { not: { required: ["product"] } }, then: {
      properties: { subjects: { items: country }, topics: { maxItems: 1 }, intent: { const: "single_subject" } },
    } }],
  };
}

export function queryOpenApiBody(schema: unknown, example: unknown) {
  return { required: true, content: { "application/json": { schema, example } } };
}

export function publicReadOperation(operationId: string, summary: string) {
  return { operationId, summary, security: [], responses: {
    "200": { description: "Read the response scope and clocks; success does not establish commercial eligibility." },
    "400": { description: "Invalid query parameters" },
    "429": { description: "Rate limited; back off without automatic payment" },
    "503": { description: "Required runtime or product unavailable" },
  } };
}

export function categoryReadOperation(id: string) {
  return { ...publicReadOperation(`discover${id}Category`, "Discover category metadata or explicit unscored research views"),
    parameters: [{ name: "view", in: "query", required: false, schema: {
      type: "string", enum: ["finds", "latest", "open-data", "combined"],
    }, description: "Omit for payment-resource discovery; these research views do not produce signed GROs." }],
  };
}

export const GEOMACRO_SUPPORT_OPENAPI_PATHS = {
  "/api/v1/intelligence/live-structured": {
    get: publicReadOperation("discoverLiveStructuredResearch", "Discover supported no-funds research requests"),
    post: { ...publicReadOperation("queryLiveStructuredResearch", "Retrieve unscored official observations or open-data measurements"),
      description: "No payment or signed GRO. Fetched now does not mean published now; country observations have a bounded lookback.",
      requestBody: queryOpenApiBody({ oneOf: [
        { type: "object", additionalProperties: false, required: ["category"], properties: { category: { enum: ["geopolitics", "macro-fx", "critical-minerals"] } } },
        { type: "object", additionalProperties: false, required: ["category", "country_iso3"], properties: {
          category: { enum: ["geopolitics", "macro-fx", "critical-minerals"] }, country_iso3: iso3,
          lookback_days: { type: "integer", minimum: 1, maximum: 7 },
        } },
        { type: "object", additionalProperties: false, required: ["question"], properties: { question: { type: "string", minLength: 8, maxLength: 300 } } },
      ] }, { category: "macro-fx", country_iso3: "IND" }),
      responses: { ...publicReadOperation("", "").responses,
        "415": { description: "JSON content type required" }, "422": { description: "Unsupported request or unavailable observation" } },
    },
  },
  "/api/public/global-risk": { get: { ...publicReadOperation("getPublicGlobalRisk", "Legacy GRI compatibility read; retired from the public website and Store"), deprecated: true } },
  "/api/public/risk-indices": { get: publicReadOperation("getPublicRiskIndices", "Public category indices with their own publication delay") },
  "/api/risk-object-keys": { get: publicReadOperation("getRiskObjectVerificationKeys", "Public signing-key lifecycle metadata") },
  "/api/health": { get: { ...publicReadOperation("getDeploymentHealth", "Runtime and product dependency health"),
    parameters: [{ name: "deep", in: "query", schema: { const: "1" } }] } },
  "/api/mcp": { post: { ...publicReadOperation("callGeomacroMcp", "MCP JSON-RPC initialize, tools/list and tools/call"),
    description: "Initialize first, then use tools/list input schemas. Tool calls preserve their own access and evidence rules.",
    requestBody: queryOpenApiBody({ type: "object", required: ["jsonrpc", "method"], properties: {
      jsonrpc: { const: "2.0" }, id: { type: ["string", "number"] }, method: { type: "string" }, params: { type: "object" },
    } }, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    responses: { ...publicReadOperation("", "").responses, "402": { description: "Tool requires a verified x402 offer" }, "405": { description: "Unsupported transport method" } },
  } },
  "/api/a2a": { get: publicReadOperation("discoverGeomacroA2a", "A2A agent card and protocol discovery; task access is separately authenticated") },
};

export { GEOMACRO_API_EXAMPLES };
