#!/usr/bin/env node
/**
 * #1827: Bring every registered source into a PRIVATE metadata intake index.
 * Not a feed scraper, a Telegram session, a Supabase writer or a public scorer.
 * The per-source hashed queue identifies every catalogued candidate regardless
 * of commercial qualification, while recording why transport is not activated.
 * Existing official transport/Telegram authorized consumer/historical jobs
 * remain their own bounded producers; this is their source-control fan-in.
 */
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VALID_DOMAINS = new Set(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
const DOMAIN_ALIAS = Object.freeze({
  GEOPOLITICS: "GEOPOLITICS", MACRO: "MACRO",
  RARE_EARTH: "CRITICAL_MINERALS", RARE_EARTHS: "CRITICAL_MINERALS",
  CRITICAL_MINERALS: "CRITICAL_MINERALS", CRITICAL_MINERAL: "CRITICAL_MINERALS",
});
const REMOTE_MAX = 512 * 1024;
const URLS = Object.freeze({
  telegram: "https://raw.githubusercontent.com/blocknine0/geomacro-telegram-signals/main/config/source_registry.json",
  historical: "https://raw.githubusercontent.com/blocknine0/geomacro-historical-data/main/config/data_sources.json",
});
function domain(input) {
  const normalized = String(input ?? "").trim().toUpperCase();
  return DOMAIN_ALIAS[normalized] ?? null;
}
function ensureRows(input, key, max, expected) {
  if (!input || typeof input !== "object" || !Array.isArray(input[key]) ||
      input[key].length > max || (expected && input.schema !== expected)) {
    throw Error("PRIVATE_INTAKE_CATALOG_SCHEMA_INVALID");
  }
  return input[key];
}
function stringId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 180 &&
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value);
}
export function assemblePrivateIntakeSnapshot(input, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error("PRIVATE_INTAKE_CLOCK_INVALID");
  const { core, free, roots, telegram, historical } = input ?? {};
  if (!core || !core.categories || typeof core.categories !== "object") throw Error("PRIVATE_INTAKE_CORE_SCHEMA_INVALID");
  const freeRows = ensureRows(free, "sources", 1000);
  const rootRows = ensureRows(roots, "roots", 1500);
  const telegramRows = ensureRows(telegram, "sources", 2000, "geomacro.telegram-source-registry.v1");
  const historicalRows = ensureRows(historical, "sources", 1000);
  const queue = [];
  const perDomain = Object.fromEntries([...VALID_DOMAINS].map(d => [d, {
    core: 0, free: 0, roots: 0, telegram: 0, historical: 0,
  }]));
  const laneCounts = { core: 0, free: 0, roots: 0, telegram: 0, historical: 0 };
  const statuses = Object.create(null);
  const identities = new Set();

  function add(lane, category, id, status) {
    if (!VALID_DOMAINS.has(category) || !stringId(id)) throw Error("PRIVATE_INTAKE_SOURCE_ID_INVALID");
    const rawKey = [lane, category, id].join(":");
    if (identities.has(rawKey)) throw Error("PRIVATE_INTAKE_DUPLICATE_SOURCE");
    identities.add(rawKey);
    const idHash = createHash("sha256").update(rawKey).digest("hex").slice(0, 32);
    queue.push({ source_ref: idHash, domain: category, lane, status });
    perDomain[category][lane] += 1;
    laneCounts[lane] += 1;
    statuses[status] = (statuses[status] || 0) + 1;
  }
  for (const [label, items] of Object.entries(core.categories)) {
    const c = domain(label);
    if (!c || !Array.isArray(items) || items.length > 1000) throw Error("PRIVATE_INTAKE_CORE_CATEGORY_INVALID");
    for (const row of items) add("core", c, row?.id, "CATALOGUED_TRANSPORT_NOT_PROVEN");
  }
  for (const row of freeRows) {
    const c = domain(row?.category);
    // ALL-domain free catalog records are duplicated across 3 private queues.
    const targets = String(row?.category).toUpperCase() === "ALL"
      ? [...VALID_DOMAINS] : [c];
    for (const target of targets) add("free", target, row?.id, "CATALOGUED_TRANSPORT_NOT_PROVEN");
  }
  for (const row of rootRows) {
    const c = domain(row?.category);
    add("roots", c, row?.source_id, "DISCOVERY_ROOT_ONLY_NOT_INGESTED");
  }
  for (const row of telegramRows) {
    const c = domain(row?.category);
    const status = row?.publisher_authorized === true &&
      row?.activation_status === "ACTIVE" && !!row?.authorization_reference
      ? "AUTHORIZED_TELEGRAM_CANDIDATE_NOT_POLLED"
      : "TELEGRAM_CANDIDATE_NOT_AUTHORIZED";
    add("telegram", c, row?.candidate_key, status);
  }
  let historicalLegacyExcluded = 0;
  for (const row of historicalRows) {
    const c = domain(row?.category);
    if (!c) {
      if (String(row?.category).toLowerCase() !== "crypto") throw Error("PRIVATE_INTAKE_UNKNOWN_HISTORICAL_DOMAIN");
      historicalLegacyExcluded++;
      continue;
    }
    add("historical", c, row?.source_id, "HISTORICAL_EVIDENCE_NOT_CURRENT_EVENT");
  }
  queue.sort((a,b) => (a.lane+a.domain+a.source_ref).localeCompare(b.lane+b.domain+b.source_ref));
  return {
    schema: "geomacro.private-all-source-intake-inventory.v1",
    observed_at: now.toISOString(),
    mode: "PRIVATE_CANDIDATE_METADATA_ONLY",
    sources_catalogued: queue.length,
    domain_lane_counts: perDomain,
    lane_counts: laneCounts,
    status_counts: statuses,
    historical_crypto_legacy_excluded: historicalLegacyExcluded,
    source_refs: queue,
    boundaries: {
      telegram_messages_ingested: false,
      original_articles_downloaded: false,
      historical_rows_downloaded: false,
      source_ownership_or_permissions_granted: false,
      rights_approval_bypassed: false,
      source_qualification_required_before_publication: true,
      scored_current_195x3_verified: false,
      public_published: false,
      chargeable: false,
      direct_b2_requests: 0,
      d1_writes: 0,
      supabase_requests: 0,
      payment_performed: false,
    },
  };
}
async function fetchPublicManifest(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error("PRIVATE_INTAKE_REMOTE_MANIFEST_UNAVAILABLE");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > REMOTE_MAX) throw Error("PRIVATE_INTAKE_REMOTE_MANIFEST_TOO_LARGE");
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > REMOTE_MAX) throw Error("PRIVATE_INTAKE_REMOTE_MANIFEST_TOO_LARGE");
  try { return JSON.parse(raw); } catch { throw Error("PRIVATE_INTAKE_REMOTE_MANIFEST_INVALID"); }
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
export async function gatherPrivateIntakeSnapshot(now = new Date(), fetcher = fetchPublicManifest) {
  const [telegram,historical] = await Promise.all([
    fetcher(URLS.telegram), fetcher(URLS.historical),
  ]);
  return assemblePrivateIntakeSnapshot({
    core: readJson("global-intelligence/sources/source-registry.v1.json"),
    free: readJson("global-intelligence/sources/free-source-catalog.v1.json"),
    roots: readJson("config/telegram-discovery-roots.json"),
    telegram, historical,
  }, now);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await gatherPrivateIntakeSnapshot();
    mkdirSync("artifacts/private-intake", { recursive: true });
    writeFileSync("artifacts/private-intake/catalogued-source-intake.json",
      JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
    // No raw source URLs, Telegram usernames, sensitive material or headlines in logs.
    const { source_refs, ...safeSummary } = result;
    console.log(JSON.stringify(safeSummary));
  } catch {
    console.error("::error::PRIVATE_SOURCE_INTAKE_INVENTORY_INCOMPLETE");
    process.exitCode = 2;
  }
}
