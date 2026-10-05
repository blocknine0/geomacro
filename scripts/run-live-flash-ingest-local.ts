#!/usr/bin/env node

import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  findRemainingDenoReferences,
  rewriteDenoEnvGets,
} from "./lib/deno-env-rewrite.mjs";

const SOURCE_PATH = path.resolve("supabase/functions/live-flash-ingest/index.ts");
const GENERATED_PATH = path.resolve(".geomacro-live-flash-ingest-local-handler.ts");
const payloadArg = process.argv.indexOf("--payload-file");
const payloadFile = String(payloadArg >= 0 ? process.argv[payloadArg + 1] ?? "" : "").trim();
const TOKEN = String(process.env.FLASH_INGEST_TOKEN ?? "geomacro-local-flash-ingest").trim();

if (!payloadFile) throw new Error("LIVE_FLASH_LOCAL_PAYLOAD_FILE_REQUIRED");
if (String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("LIVE_FLASH_LOCAL_REQUIRES_DIRECT_POSTGRES");
}
if (!String(process.env.SUPABASE_DB_URL ?? "").trim()) throw new Error("SUPABASE_DB_URL_REQUIRED");

// The canonical handler retains its server-configuration guard even though the
// direct-Postgres adapter ignores REST credentials. Non-secret placeholders keep
// that canonical guard satisfied without introducing a second data truth.
process.env.SUPABASE_URL ||= "https://direct-postgres.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "direct-postgres-local";
process.env.FLASH_INGEST_TOKEN = TOKEN;
process.env.SIGNAL_DB_MODE = "false";

function replaceExactlyOnce(source: string, needle: string, replacement: string, label: string) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) throw new Error(`LOCAL_FLASH_TRANSFORM_${label}_MISMATCH`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function buildHandler() {
  let source = await readFile(SOURCE_PATH, "utf8");
  source = replaceExactlyOnce(
    source,
    'import { createClient } from "https://esm.sh/@supabase/supabase-js@2"',
    'import { createGriDbClient } from "./scripts/lib/gri-db-client.mjs"',
    "IMPORT",
  );

  const dbStart = source.indexOf("const db =\n  createClient(");
  const typeStart = source.indexOf("type CountryRow = {");
  if (dbStart < 0 || typeStart <= dbStart) throw new Error("LOCAL_FLASH_TRANSFORM_DB_MISMATCH");
  source = source.slice(0, dbStart)
    + "const db = createGriDbClient()\n\n"
    + source.slice(typeStart);

  // Direct PostgreSQL writes the real table columns rather than PostgREST's
  // presentation aliases. Preserve the already-verified bridge channel key so
  // the database-level publisher-authorization trigger can evaluate the same
  // canonical event row. This is transport adaptation only; the Edge source
  // remains the business-logic authority.
  source = replaceExactlyOnce(
    source,
    "    source_id:\n      sourceId,\n    source_record_id:\n      sourceRecordId,",
    "    source_id:\n      sourceId,\n    source_channel_key:\n      cleanString(payload.source_channel_key, 64),\n    source_record_id:\n      sourceRecordId,",
    "CHANNEL_KEY",
  );

  source = rewriteDenoEnvGets(source);
  source = replaceExactlyOnce(
    source,
    "Deno.serve(async request => {",
    "export async function handleLiveFlashIngestRequest(request: Request) {",
    "SERVE",
  );

  const trimmed = source.trimEnd();
  if (!trimmed.endsWith("})")) throw new Error("LOCAL_FLASH_TRANSFORM_END_MISMATCH");
  source = trimmed.slice(0, -2) + "}\n";

  const remainingDenoReferences = findRemainingDenoReferences(source);
  if (remainingDenoReferences.length > 0) {
    throw new Error(`LOCAL_FLASH_DENO_REFERENCE_REMAINS:${remainingDenoReferences.join(",")}`);
  }
  if (!source.includes('sourceId ===\n      "telegram_mtproto_flash"')) {
    throw new Error("LOCAL_FLASH_CANONICAL_TELEGRAM_GUARD_MISSING");
  }
  if (!source.includes("source_channel_key:\n      cleanString(payload.source_channel_key, 64)")) {
    throw new Error("LOCAL_FLASH_CHANNEL_KEY_TRANSPORT_MISSING");
  }
  if (!source.includes('verification_status:\n      verificationStatus')) {
    throw new Error("LOCAL_FLASH_CANONICAL_VERIFICATION_PATH_MISSING");
  }
  await writeFile(GENERATED_PATH, source, "utf8");
}

async function main() {
  try {
    const payloadText = await readFile(path.resolve(payloadFile), "utf8");
    const payload = JSON.parse(payloadText);
    await buildHandler();
    const moduleUrl = `${pathToFileURL(GENERATED_PATH).href}?run=${Date.now()}`;
    const mod = await import(moduleUrl);
    if (typeof mod.handleLiveFlashIngestRequest !== "function") {
      throw new Error("LOCAL_FLASH_HANDLER_EXPORT_MISSING");
    }
    const request = new Request("http://geomacro.local/live-flash-ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-geomacro-flash-token": TOKEN,
      },
      body: JSON.stringify(payload),
    });
    const response = await mod.handleLiveFlashIngestRequest(request);
    const text = await response.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`LOCAL_FLASH_NON_JSON_RESPONSE:${text.slice(0, 500)}`);
    }
    if (!response.ok || body?.ok !== true) {
      throw new Error(`LOCAL_FLASH_REJECTED:${response.status}:${JSON.stringify(body).slice(0, 1200)}`);
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
