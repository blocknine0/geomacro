import fs from "node:fs/promises";

const registry = JSON.parse(await fs.readFile("global-intelligence/sources/source-registry.v1.json","utf8"));
const errors = [];
const seen = new Set();
const categories = ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"];

for (const category of categories) {
  const sources = registry.categories?.[category];
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`Missing source category: ${category}`);
    continue;
  }

  const hasGlobal = sources.some(source =>
    ["global","country_and_global","global_trade","maritime"].includes(String(source.coverage).toLowerCase())
  );
  const hasCountry = sources.some(source =>
    ["country","country_and_global"].includes(String(source.coverage).toLowerCase())
  );
  if (!hasGlobal) errors.push(`${category}: no global-capable source`);
  if (!hasCountry) errors.push(`${category}: no country-primary source`);

  for (const source of sources) {
    if (seen.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
    seen.add(source.id);

    if (!source.class || !source.access || !source.auth || !source.coverage) {
      errors.push(`Incomplete source metadata: ${source.id}`);
    }
    if (!Number.isInteger(source.priority) || source.priority < 1) {
      errors.push(`Invalid priority: ${source.id}`);
    }
    if (source.class === "TELEGRAM_VERIFIED" && source.auth !== "telegram_api") {
      errors.push(`Telegram verified source must use telegram_api: ${source.id}`);
    }
    if (source.class === "TELEGRAM_EARLY_SIGNAL" && source.auth !== "telegram_api") {
      errors.push(`Telegram early-signal source must use telegram_api: ${source.id}`);
    }
  }
}

const candidateSources = registry.candidate_sources_not_yet_approved ?? [];
if (!Array.isArray(candidateSources)) errors.push("candidate_sources_not_yet_approved must be an array");

const forbidden = ["NewsAPI.org","GNews","Mediastack"];
for (const candidate of candidateSources) {
  if (forbidden.includes(candidate)) {
    errors.push(`Unapproved commercial/free-tier candidate: ${candidate}`);
  }
}

const result = {ok:errors.length===0,source_count:seen.size,category_count:categories.length,errors};
console.log(JSON.stringify(result,null,2));
if (!result.ok) process.exit(1);
