import fs from "node:fs/promises";

const registry = JSON.parse(await fs.readFile("global-intelligence/sources/source-registry.v1.json","utf8"));
const errors = [];
const seen = new Set();

for (const [category, sources] of Object.entries(registry.categories)) {
  if (!["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].includes(category)) errors.push(`Unknown category: ${category}`);
  for (const source of sources) {
    if (seen.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
    seen.add(source.id);
    if (!source.class || !source.access || !source.auth || !source.coverage) {
      errors.push(`Incomplete source metadata: ${source.id}`);
    }
    if (source.class === "TELEGRAM_VERIFIED" && source.auth !== "telegram_api") {
      errors.push(`Telegram verified source must use telegram_api: ${source.id}`);
    }
  }
}

const forbidden = ["NewsAPI.org","GNews","Mediastack"];
for (const candidate of registry.candidate_sources_not_yet_approved) {
  if (forbidden.includes(candidate)) errors.push(`Unapproved commercial/free-tier candidate: ${candidate}`);
}

const result = {ok:errors.length===0,source_count:seen.size,errors};
console.log(JSON.stringify(result,null,2));
if (!result.ok) process.exit(1);
