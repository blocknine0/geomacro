#!/usr/bin/env node

import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SOURCE_PATH = path.resolve("supabase/functions/live-structure-intelligence/index.ts");
const GENERATED_PATH = path.resolve(".geomacro-live-structure-local-handler.ts");
const TOKEN = String(process.env.LIVE_STRUCTURE_TOKEN ?? "").trim();
const fragmentArg = process.argv.indexOf("--fragment-id");
const fragmentId = String(fragmentArg >= 0 ? process.argv[fragmentArg + 1] ?? "" : "").trim();

if (!TOKEN) throw new Error("LIVE_STRUCTURE_TOKEN_REQUIRED");
if (!fragmentId || !/^[0-9a-f-]{36}$/i.test(fragmentId)) throw new Error("LIVE_STRUCTURE_FRAGMENT_ID_REQUIRED");
if (String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("LIVE_STRUCTURE_LOCAL_REQUIRES_DIRECT_POSTGRES");
}
if (!String(process.env.SUPABASE_DB_URL ?? "").trim()) throw new Error("SUPABASE_DB_URL_REQUIRED");

// The canonical structurer expects read-only B2 archive credentials by these
// names. The GitHub production recovery owner already has bucket-scoped B2
// credentials, so expose aliases locally without changing the canonical source.
process.env.B2_ARCHIVE_READ_KEY_ID ||= String(process.env.B2_KEY_ID ?? "").trim();
process.env.B2_ARCHIVE_READ_APPLICATION_KEY ||= String(process.env.B2_APPLICATION_KEY ?? "").trim();
if (!process.env.B2_ARCHIVE_READ_KEY_ID || !process.env.B2_ARCHIVE_READ_APPLICATION_KEY) {
  throw new Error("B2_ARCHIVE_READ_CREDENTIALS_REQUIRED");
}

function replaceExactlyOnce(source: string, needle: string, replacement: string, label: string) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) throw new Error(`LOCAL_STRUCTURER_TRANSFORM_${label}_MISMATCH`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function buildHandler() {
  let source = await readFile(SOURCE_PATH, "utf8");
  source = replaceExactlyOnce(
    source,
    'import { createClient } from "npm:@supabase/supabase-js@2";',
    'import { createGriDbClient } from "./scripts/lib/gri-db-client.mjs";',
    "IMPORT",
  );

  const adminStart = source.indexOf("function admin() {");
  const normStart = source.indexOf("function norm(value: string)");
  if (adminStart < 0 || normStart <= adminStart) throw new Error("LOCAL_STRUCTURER_TRANSFORM_ADMIN_MISMATCH");
  source = source.slice(0, adminStart)
    + "function admin() {\n  return createGriDbClient();\n}\n\n"
    + source.slice(normStart);

  source = source.replace(/Deno\.env\.get\(\s*"([A-Z0-9_]+)"\s*\)/g, (_match, name) => `process.env.${name}`);
  source = replaceExactlyOnce(
    source,
    "Deno.serve(async (req) => {",
    "export async function handleLiveStructureRequest(req: Request) {",
    "SERVE",
  );

  const trimmed = source.trimEnd();
  if (!trimmed.endsWith("});")) throw new Error("LOCAL_STRUCTURER_TRANSFORM_END_MISMATCH");
  source = trimmed.slice(0, -3) + "}\n";

  if (source.includes("Deno.")) throw new Error("LOCAL_STRUCTURER_DENO_REFERENCE_REMAINS");
  if (!source.includes('const STRUCTURE_VERSION = "live-structure-v1.4.9"')) {
    throw new Error("LOCAL_STRUCTURER_CANONICAL_VERSION_MISSING");
  }
  await writeFile(GENERATED_PATH, source, "utf8");
}

async function main() {
  try {
    await buildHandler();
    const moduleUrl = `${pathToFileURL(GENERATED_PATH).href}?run=${Date.now()}`;
    const mod = await import(moduleUrl);
    if (typeof mod.handleLiveStructureRequest !== "function") {
      throw new Error("LOCAL_STRUCTURER_HANDLER_EXPORT_MISSING");
    }
    const request = new Request("http://geomacro.local/live-structure-intelligence", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-geomacro-structure-token": TOKEN,
      },
      body: JSON.stringify({ fragment_id: fragmentId }),
    });
    const response = await mod.handleLiveStructureRequest(request);
    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`LOCAL_STRUCTURER_NON_JSON_RESPONSE:${text.slice(0, 500)}`);
    }
    if (!response.ok || body?.ok !== true) {
      throw new Error(`LOCAL_STRUCTURER_REJECTED:${response.status}:${JSON.stringify(body).slice(0, 1200)}`);
    }
    console.log(JSON.stringify({ ...body, execution_mode: "local_canonical_source_direct_postgres" }));
  } finally {
    await rm(GENERATED_PATH, { force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
