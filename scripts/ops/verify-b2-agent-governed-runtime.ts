#!/usr/bin/env bun
import { readB2AgentGovernedModulesSnapshot } from "../../src/lib/b2-agent-governed-modules.server";

const MAX_NEW_SNAPSHOT_AGE_MS = 15 * 60 * 1000;
const required = [
  ["BRA", "macro_monetary"],
  ["BRA", "external_fx"],
  ["USA", "macro_monetary"],
  ["USA", "external_fx"],
  ["ZAF", "critical_minerals"],
  ["CHN", "critical_minerals"],
] as const;

const snapshot = await readB2AgentGovernedModulesSnapshot();
if (!snapshot) throw new Error("B2_AGENT_MODULE_RUNTIME_READER_REJECTED_SNAPSHOT");
const generatedMs = Date.parse(snapshot.generated_at);
const ageMs = Date.now() - generatedMs;
if (!Number.isFinite(generatedMs) || ageMs < -5 * 60_000 || ageMs > MAX_NEW_SNAPSHOT_AGE_MS) {
  throw new Error("B2_AGENT_MODULE_RUNTIME_SNAPSHOT_NOT_FRESHLY_PUBLISHED");
}

const keys = new Set(snapshot.entries.map((entry) => `${entry.country_iso3}:${entry.module}`));
const missing = required
  .map(([country, module]) => `${country}:${module}`)
  .filter((key) => !keys.has(key));
if (missing.length) throw new Error(`B2_AGENT_MODULE_RUNTIME_REQUIRED_OUTPUT_MISSING:${missing.join(",")}`);

const counts = snapshot.entries.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.module] = (acc[entry.module] ?? 0) + 1;
  return acc;
}, {});
for (const module of ["macro_monetary", "external_fx", "critical_minerals"]) {
  if (!Number.isInteger(counts[module]) || counts[module] < 1) {
    throw new Error(`B2_AGENT_MODULE_RUNTIME_MODULE_EMPTY:${module}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  runtime_reader_accepted: true,
  generated_at: snapshot.generated_at,
  age_seconds: Math.floor(ageMs / 1000),
  entries: snapshot.entries.length,
  entries_by_module: counts,
  required_outputs_verified: required.map(([country, module]) => `${country}:${module}`),
  supabase_serving_dependency: false,
  destructive_changes: false,
}));
