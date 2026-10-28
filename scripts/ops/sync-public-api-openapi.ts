import { readFileSync, writeFileSync } from "node:fs";
import { officialGeomacroAgentOpenApi } from "../../src/lib/official-geomacro-agent.server";
import {publicQueryOpenApiSchema,storeProductOpenApiSchema} from "../../src/lib/public-api-openapi.server";

// Preserve provider compatibility contracts; canonical v1 paths come from the
// exact same generator as GET /api/v1/agent?view=openapi. No runtime discovery
// or receiver configuration is exported into a static artifact.
const path = "public/openapi-x402.json";
const previous = JSON.parse(readFileSync(path, "utf8"));
const canonical = officialGeomacroAgentOpenApi();
const legacyPaths = Object.fromEntries(Object.entries(previous.paths)
  .filter(([key]) => key.startsWith("/api/x402/")));
const spec = { ...canonical, paths: { ...legacyPaths, ...canonical.paths },
  components: previous.components,
};
const query = spec.components.schemas.AdaptiveQuery;
query.properties.detail.enum = ["compact", "standard", "full"];
query.properties.subjects.maxItems = 25;
query.properties.max_age_seconds.minimum = 1;
query.properties.product = storeProductOpenApiSchema();
query.properties.delivery_tier = publicQueryOpenApiSchema().properties.delivery_tier;
query.properties.fulfillment_mode = publicQueryOpenApiSchema().properties.fulfillment_mode;
query.properties.response_locale = publicQueryOpenApiSchema().properties.response_locale;
writeFileSync(path, JSON.stringify(spec, null, 2) + "\n");
const requestPath = "schemas/agent-query-v1.schema.json";
const request = JSON.parse(readFileSync(requestPath, "utf8"));
request.properties.product = storeProductOpenApiSchema();
request.properties.delivery_tier = publicQueryOpenApiSchema().properties.delivery_tier;
request.properties.fulfillment_mode = publicQueryOpenApiSchema().properties.fulfillment_mode;
writeFileSync(requestPath, JSON.stringify(request, null, 2) + "\n");
const responsePath = "schemas/adaptive-intelligence-response-v1.schema.json";
const response = JSON.parse(readFileSync(responsePath, "utf8"));
response.properties.question_interpretation.properties.product = storeProductOpenApiSchema();
response.properties.question_interpretation.properties.delivery_tier = { const: "structural_baseline" };
response.properties.structural.items.properties.evidence_summary.properties.governed_module_count = { type: "integer", minimum: 0 };
Object.assign(response.properties.methodology.properties, {
  delivery_tier: { const: "structural_baseline" },
  source_clock: { const: "SOURCE_NATIVE_STRUCTURAL_PUBLICATION" },
  signed_current_risk_object_included: { const: false },
  independently_scored_current_risk_included: { const: false },
  customer_facing_output: { const: "decision_intelligence_v1" },
  change_intelligence_contract: { const: "geomacro.change-intelligence.v1" },
  governed_module_fallbacks: { type: "array", items: { type: "string" } },
});
response.properties.limitations.properties.wgi_upstream_perception_source_material_redistributed = { const: false };
// The paid privacy boundary strips this source-internal flag. It may occur
// before sanitization, but is not a required field of customer bytes.
response.properties.limitations.required = response.properties.limitations.required.filter((field: string) =>
  field !== "current_event_raw_source_material_redistributed");
response.properties.payment.properties.provider = { enum: ["coinbase_cdp_x402", "coinbase_x402", "circle_gateway_x402"] };
// Retain already-published additive child contracts (market_watch and native
// locale) when rebuilding the generic decision shell. Old frozen receipts
// remain compatible; deterministic generator output must not erase them.
const existingDecisionProperties={...response.properties.decision_intelligence?.items?.properties};
for (const [field, version] of [["change_intelligence", "geomacro.change-intelligence.v1"], ["decision_intelligence", "geomacro.decision-intelligence.v1"]]) {
  response.properties[field] = { type: "array", items: { type: "object", required: ["schema_version", "execution_authorized", "raw_data_delivered"], properties: {
    schema_version: { const: version }, execution_authorized: { const: false }, raw_data_delivered: { const: false },
  }, additionalProperties: true } };
}
Object.assign(response.properties.decision_intelligence.items.properties,existingDecisionProperties);
response.properties.availability = { type: "object", description: "Source-private admission summary; never a payment receipt." };
response.properties.data_attribution = { type: "object", description: "Only separately approved fixed derived-data attribution; does not grant source rights." };
writeFileSync(responsePath, JSON.stringify(response, null, 2) + "\n");
console.log(`Synchronized ${Object.keys(spec.paths).length} public and compatibility paths.`);
