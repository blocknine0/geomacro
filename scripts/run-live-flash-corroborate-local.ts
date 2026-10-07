#!/usr/bin/env node

import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  findRemainingDenoReferences,
  rewriteDenoEnvGets,
} from "./lib/deno-env-rewrite.mjs";

const SOURCE_PATH = path.resolve("supabase/functions/live-flash-corroborate/index.ts");
const GENERATED_PATH = path.resolve(`.geomacro-live-flash-corroborate-local-handler-${process.pid}.ts`);
const TOKEN = String(process.env.FLASH_INGEST_TOKEN ?? "geomacro-local-flash-corroborate").trim();

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

const countryIso3 = arg("--country").toUpperCase();
const asOf = arg("--as-of");
const offsetRaw = arg("--candidate-offset");
const healthMode = process.argv.includes("--health");
const candidateOffset = offsetRaw ? Number(offsetRaw) : 0;

if (countryIso3 && !/^[A-Z]{3}$/.test(countryIso3)) throw new Error("LOCAL_CORROBORATE_COUNTRY_INVALID");
if (asOf && !Number.isFinite(Date.parse(asOf))) throw new Error("LOCAL_CORROBORATE_AS_OF_INVALID");
if (!Number.isInteger(candidateOffset) || candidateOffset < 0 || candidateOffset >= 600 || candidateOffset % 120 !== 0) {
  throw new Error("LOCAL_CORROBORATE_OFFSET_INVALID");
}
if (healthMode && (countryIso3 || asOf || offsetRaw)) {
  throw new Error("LOCAL_CORROBORATE_HEALTH_MODE_EXCLUSIVE");
}
if (String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("LOCAL_CORROBORATE_REQUIRES_DIRECT_POSTGRES");
}
if (!String(process.env.SUPABASE_DB_URL ?? "").trim()) throw new Error("SUPABASE_DB_URL_REQUIRED");

process.env.SUPABASE_URL ||= "https://direct-postgres.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "direct-postgres-local";
process.env.FLASH_INGEST_TOKEN = TOKEN;
process.env.SIGNAL_DB_MODE = "false";

function replaceExactlyOnce(source: string, needle: string, replacement: string, label: string) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) throw new Error(`LOCAL_CORROBORATE_TRANSFORM_${label}_MISMATCH`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function buildHandler() {
  let source = await readFile(SOURCE_PATH, "utf8");
  source = replaceExactlyOnce(
    source,
    'import { loadCountryCorroborationWindow, COUNTRY_WINDOW_LIMIT, COUNTRY_BATCH_SIZE } from "./country-window.ts"',
    'import { loadCountryCorroborationWindow, COUNTRY_WINDOW_LIMIT, COUNTRY_BATCH_SIZE } from "./supabase/functions/live-flash-corroborate/country-window.ts"',
    "COUNTRY_WINDOW_IMPORT",
  );
  source = replaceExactlyOnce(
    source,
    'import { createClient } from "https://esm.sh/@supabase/supabase-js@2"',
    'import { createGriDbClient } from "./scripts/lib/gri-db-client.mjs"',
    "DB_IMPORT",
  );
  source = replaceExactlyOnce(
    source,
    'import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.3"',
    'import { createRemoteJWKSet, jwtVerify } from "jose"',
    "JOSE_IMPORT",
  );
  const dbStart = source.indexOf("const db = createClient(");
  const stopwordsStart = source.indexOf("const STOPWORDS = new Set([");
  if (dbStart < 0 || stopwordsStart <= dbStart) throw new Error("LOCAL_CORROBORATE_TRANSFORM_DB_MISMATCH");
  source = source.slice(0, dbStart) + "const db = createGriDbClient()\n\n" + source.slice(stopwordsStart);
  source = rewriteDenoEnvGets(source);
  source = replaceExactlyOnce(
    source,
    "Deno.serve(async request => {",
    "export async function handleLiveFlashCorroborateRequest(request: Request) {",
    "SERVE",
  );
  const trimmed = source.trimEnd();
  if (!trimmed.endsWith("})")) throw new Error("LOCAL_CORROBORATE_TRANSFORM_END_MISMATCH");
  source = trimmed.slice(0, -2) + "}\n";
  const remainingDenoReferences = findRemainingDenoReferences(source);
  if (remainingDenoReferences.length > 0) throw new Error(`LOCAL_CORROBORATE_DENO_REFERENCE_REMAINS:${remainingDenoReferences.join(",")}`);
  for (const marker of [
    "FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2",
    "FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45",
    "FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65",
  ]) {
    if (!source.includes(marker)) throw new Error(`LOCAL_CORROBORATE_STRICT_CONTRACT_MISSING:${marker}`);
  }
  await writeFile(GENERATED_PATH, source, "utf8");
}

async function main() {
  try {
    await buildHandler();
    const moduleUrl = `${pathToFileURL(GENERATED_PATH).href}?run=${Date.now()}`;
    const mod = await import(moduleUrl);
    if (typeof mod.handleLiveFlashCorroborateRequest !== "function") throw new Error("LOCAL_CORROBORATE_HANDLER_EXPORT_MISSING");

    const body: Record<string, unknown> = {};
    if (countryIso3) body.country_iso3 = countryIso3;
    if (asOf) body.as_of = new Date(asOf).toISOString();
    if (countryIso3 || offsetRaw) body.candidate_offset = candidateOffset;

    const requestUrl = healthMode
      ? "http://geomacro.local/live-flash-corroborate?mode=health"
      : "http://geomacro.local/live-flash-corroborate";
    const request = new Request(requestUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-geomacro-flash-token": TOKEN },
      body: JSON.stringify(body),
    });
    const response = await mod.handleLiveFlashCorroborateRequest(request);
    const text = await response.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`LOCAL_CORROBORATE_NON_JSON_RESPONSE:${text.slice(0, 500)}`);
    }
    if (!response.ok || parsed?.ok !== true) {
      throw new Error(`LOCAL_CORROBORATE_REJECTED:${response.status}:${JSON.stringify(parsed).slice(0, 2000)}`);
    }
    console.log(JSON.stringify({
      ...parsed,
      execution_mode: "local_canonical_corroboration_direct_postgres",
      threshold_weakening: false,
    }));
  } finally {
    await rm(GENERATED_PATH, { force: true }).catch(() => {});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "LOCAL_CORROBORATE_FAILURE";
  console.error(String(message).replace(/[^\x20-\x7E]/g, " ").slice(0, 600));
  process.exit(1);
});
