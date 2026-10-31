import { GEOMACRO_OFFICIAL_API_CATALOG, formatGeomacroApiDisplayPath } from "./geomacro-official-api-branding";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";

/** Shared developer/agent catalog. A listed route does not establish readiness. */
const TRANSPORT_ENDPOINTS = [
  ...GEOMACRO_OFFICIAL_API_CATALOG.map(api => ({
    ...api, methods: ["GET", "POST"],
    purpose: api.id === "agent" ? "Discover tools; POST a tool and arguments envelope."
      : api.id === "intelligence" ? "Country, corridor and multi-topic queries through the shared engine."
      : "Country queries within this category; canonical evidence and payment checks.",
    access: "GET discovery; POST requires per-request eligibility and x402.",
  })),
  { id: "availability", name: "Structural availability", methods: ["GET", "POST"],
    path: "/api/v1/intelligence/availability",
    purpose: "Structural baseline preflight. Legacy: one country/topic; explicit Store product: country/corridor digest or full multidimension profile.", access: "No funds; not current signed risk." },
  { id: "pricing", name: "Approved USDC prices", methods: ["GET"],
    path: "/api/v1/pricing", purpose: "Exact capability prices and output contracts.", access: "Public catalog; not a payment offer." },
  { id: "networks", name: "USDC networks", methods: ["GET"],
    path: "/api/v1/payments/networks", purpose: "Base, Arc and Polygon native USDC rails.", access: "Discovery; activation checked separately." },
  { id: "price_preflight", name: "Price preview", methods: ["POST"],
    path: "/api/v1/payments/preflight", purpose: "Preview a capability, variant and network amount.", access: "No funds; does not prove deliverability." },
  { id: "outputs", name: "Output contracts & licence", methods: ["GET"],
    path: "/api/intelligence/capabilities", purpose: "view=outputs for fields or view=license for terms.", access: "Public discovery." },
  { id: "finds", name: "Public Finds", methods: ["GET"],
    path: "/api/v1/finds", purpose: "Derived cards; domain=geopolitics, macro or rare_earth.", access: "No funds; unscored research, not a signed risk product." },
  { id: "live_structured", name: "Live structured research", methods: ["GET", "POST"],
    path: "/api/v1/intelligence/live-structured", purpose: "Official observations and open-data measurements by category, country or supported numeric question.", access: "No funds; reference periods may precede retrieval." },
  { id: "risk_indices", name: "Public Risk Indices", methods: ["GET"],
    path: "/api/public/risk-indices", purpose: "Public category indices with publication delay and verification status.", access: "Website research; current values may be unavailable." },
  { id: "keys", name: "Risk Object verification keys", methods: ["GET"],
    path: "/api/risk-object-keys", purpose: "Public keys and key lifecycle metadata.", access: "Public verification metadata." },
  { id: "health", name: "Deployment health", methods: ["GET"],
    path: "/api/health", purpose: "Runtime status; deep=1 checks product dependencies.", access: "Diagnostics; HTTP 200 alone is not a payable offer." },
  { id: "mcp", name: "MCP tools", methods: ["POST"],
    path: "/api/mcp", purpose: "JSON-RPC initialize, tools/list and tools/call.", access: "Tool-specific proof verification or governed x402 delivery." },
  { id: "a2a", name: "A2A discovery", methods: ["GET"],
    path: "/api/a2a", purpose: "Agent card and protocol routes.", access: "Discovery; tasks follow their own authentication." },
] as const;

export const GEOMACRO_PUBLIC_API_ENDPOINTS = TRANSPORT_ENDPOINTS.map(endpoint => ({
  ...endpoint,
  display_url: formatGeomacroApiDisplayPath(endpoint.path),
}));

export const GEOMACRO_API_EXAMPLES = {
  ...GEOMACRO_STORE_REQUEST_EXAMPLES,
  query: { subjects: [{ type: "country", country_iso3: "IND" }], topics: ["macro_risk", "fx_external_risk"], question: "What are the macro and FX risks for India?", fulfillment_mode: "published_only", detail: "standard" },
  geopolitics: { subjects: [{ type: "country", country_iso3: "IND" }], question: "What are the geopolitical risks for India?", fulfillment_mode: "published_only", detail: "standard" },
  macro_fx: { subjects: [{ type: "country", country_iso3: "IND" }], question: "What are the macro and FX risks for India?", fulfillment_mode: "published_only", detail: "standard" },
  critical_minerals: { subjects: [{ type: "country", country_iso3: "IND" }], question: "What are the critical minerals risks for India?", fulfillment_mode: "published_only", detail: "standard" },
  availability: { subjects: [{ type: "country", country_iso3: "IND" }], topics: ["macro_risk"], delivery_tier: "structural_baseline", fulfillment_mode: "published_only", detail: "compact" },
  price_preflight: { capability: "structural_country_digest", variant: "standard", network: "base" },
  agent: { tool: "macro_fx_query", arguments: { country_iso3: "IND", question: "What are the macro and FX risks for India?", fulfillment_mode: "published_only" } },
} as const;
