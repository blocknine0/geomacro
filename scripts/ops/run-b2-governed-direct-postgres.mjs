#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "publish-b2-agent-governed-modules.ts");
const tempPath = join(here, ".direct-pg-publish-b2-agent-governed-modules.ts");

if (!String(process.env.SUPABASE_DB_URL ?? "").trim()) {
  throw new Error("B2_AGENT_MODULE_DIRECT_POSTGRES_DB_URL_REQUIRED");
}

let source = readFileSync(sourcePath, "utf8");
const importNeedle = 'import { createClient } from "@supabase/supabase-js";';
const configNeedle = `  process.env.APP_SUPABASE_URL !== PROJECT_URL ||\n  !process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||\n`;
const clientNeedle = `const db = createClient(\n  PROJECT_URL,\n  process.env.APP_SUPABASE_SERVICE_ROLE_KEY,\n  { auth: { persistSession: false, autoRefreshToken: false }, db: { retry: false } },\n);`;

for (const [label, needle] of [
  ["import", importNeedle],
  ["config", configNeedle],
  ["client", clientNeedle],
]) {
  if (!source.includes(needle)) throw new Error(`B2_AGENT_MODULE_DIRECT_PATCH_${label.toUpperCase()}_DRIFT`);
  if (source.indexOf(needle) !== source.lastIndexOf(needle)) throw new Error(`B2_AGENT_MODULE_DIRECT_PATCH_${label.toUpperCase()}_AMBIGUOUS`);
}

source = source
  .replace(importNeedle, 'import { createDirectPostgresClient } from "./direct-postgres-supabase-lite";')
  .replace(configNeedle, `  !process.env.SUPABASE_DB_URL ||\n`)
  .replace(clientNeedle, 'const db = createDirectPostgresClient(String(process.env.SUPABASE_DB_URL));');

writeFileSync(tempPath, source, { encoding: "utf8", mode: 0o600 });
try {
  const child = spawnSync(process.execPath, [tempPath], {
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(typeof child.status === "number" ? child.status : 1);
} finally {
  try { unlinkSync(tempPath); } catch {}
}
