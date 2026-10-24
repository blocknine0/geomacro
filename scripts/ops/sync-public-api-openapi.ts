import { readFileSync, writeFileSync } from "node:fs";
import { officialGeomacroAgentOpenApi } from "../../src/lib/official-geomacro-agent.server";

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
writeFileSync(path, JSON.stringify(spec, null, 2) + "\n");
console.log(`Synchronized ${Object.keys(spec.paths).length} public and compatibility paths.`);
