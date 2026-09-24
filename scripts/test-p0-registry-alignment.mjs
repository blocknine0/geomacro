#!/usr/bin/env node
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await fs.readFile(new URL(path, ROOT), "utf8"));

const p0 = await readJson("config/global-p0-source-expansion.json");
const registry = await readJson("global-intelligence/sources/source-registry.v1.json");
const freeCatalog = await readJson("global-intelligence/sources/free-source-catalog.v1.json");
const migration = await fs.readFile(new URL("supabase/migrations/974_global_source_p0_expansion.sql", ROOT), "utf8");

const expected = [
  ["uk_sanctions_list","GEOPOLITICS"],
  ["eu_sanctions_consolidated","GEOPOLITICS"],
  ["opcw_news","GEOPOLITICS"],
  ["icj_cases","GEOPOLITICS"],
  ["icc_news","GEOPOLITICS"],
  ["unctadstat_global","MACRO"],
  ["world_bank_commodity_prices","MACRO"],
  ["china_mofcom_trade_controls","CRITICAL_MINERALS"],
  ["australia_critical_minerals","CRITICAL_MINERALS"],
  ["cochilco_minerals","CRITICAL_MINERALS"],
];

const errors = [];
const sources = p0?.p0_global_source_expansion?.sources ?? {};
if (Object.keys(sources).length !== expected.length) {
  errors.push(`P0 config source count mismatch: expected ${expected.length}, got ${Object.keys(sources).length}`);
}

for (const [id, category] of expected) {
  const p = sources[id];
  if (!p) {
    errors.push(`P0 config missing ${id}`);
    continue;
  }
  if (p.category !== category) errors.push(`${id}: wrong P0 category`);
  if (p.enabled !== false) errors.push(`${id}: P0 enabled must remain false`);
  if (!migration.includes(id)) errors.push(`${id}: missing from migration 974`);

  const inRegistry = (registry.categories?.[category] ?? []).some((row) => row.id === id);
  if (!inRegistry) errors.push(`${id}: missing from global source registry`);

  const inFreeCatalog = (freeCatalog.sources ?? []).some((row) => row.id === id && (row.category === category || row.category === "ALL"));
  if (!inFreeCatalog) errors.push(`${id}: missing from free source catalog`);
}

if ((migration.match(/enabled_for_ingestion\\s*=\\s*false/gi) ?? []).length !== 1) errors.push("migration 974 must explicitly disable ingestion fail-closed");
if (errors.length) {
  console.error(JSON.stringify({status:"FAIL",errors}, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status:"PASS",
  source_count:expected.length,
  categories:{
    GEOPOLITICS:expected.filter(([,c])=>c==="GEOPOLITICS").length,
    MACRO:expected.filter(([,c])=>c==="MACRO").length,
    CRITICAL_MINERALS:expected.filter(([,c])=>c==="CRITICAL_MINERALS").length
  },
  all_sources_disabled:true,
  registries_aligned:true
}, null, 2));
