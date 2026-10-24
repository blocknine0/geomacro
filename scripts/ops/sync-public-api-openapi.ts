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
writeFileSync(responsePath, JSON.stringify(response, null, 2) + "\n");
console.log(`Synchronized ${Object.keys(spec.paths).length} public and compatibility paths.`);
