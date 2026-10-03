#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const LIVE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz";
const PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json";
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"];
const ROWS_PER_CATEGORY = 40;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function authoritativeDbUrl() {
  const raw = String(process.env.SUPABASE_DB_URL ?? "").trim();
  if (!raw) throw new Error("SUPABASE_DB_URL_REQUIRED");
  let db;
  try {
    db = new URL(raw);
  } catch {
    throw new Error("SUPABASE_DB_URL_INVALID");
  }
  const direct = db.hostname === `db.${PROJECT_REF}.supabase.co` && db.username === "postgres";
  const pooler = db.hostname.endsWith(".pooler.supabase.com") && db.username === `postgres.${PROJECT_REF}`;
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    (!direct && !pooler) ||
    !db.password ||
    db.pathname !== "/postgres"
  ) throw new Error("SUPABASE_DB_URL_NOT_AUTHORITATIVE");
  return raw;
}

function terminateSqlStatement(sql) {
  const statement = String(sql ?? "").trim().replace(/;+\s*$/u, "");
  if (!statement) throw new Error("PUBLIC_INTELLIGENCE_SQL_EMPTY");
  return `${statement};`;
}

function psqlRows(dbUrl, sql) {
  const wrapped = `
    begin read only;
    set local statement_timeout = '20s';
    set local lock_timeout = '5s';
    ${terminateSqlStatement(sql)}
    commit;
  `;
  const stdout = execFileSync(
    "psql",
    [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atqc", wrapped],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readScoredRows(dbUrl) {
  return psqlRows(
    dbUrl,
    `
      select row_to_json(t)::text
      from (
        with ranked as (
          select
            id,
            source_title,
            summary,
            category,
            severity,
            delta,
            created_at,
            published_at,
            row_number() over (
              partition by category
              order by coalesce(published_at, created_at) desc, created_at desc, id desc
            ) as rn
          from public.events
          where category in ('geopolitics','macro','rare_earth')
            and severity is not null
            and severity between 0 and 100
            and classification_version = '${CLASSIFICATION_VERSION}'
            and coalesce(published_at, created_at) <= now() + interval '5 minutes'
            and created_at >= now() - interval '30 days'
        )
        select id,source_title,summary,category,severity,delta,created_at,published_at
        from ranked
        where rn <= ${ROWS_PER_CATEGORY}
        order by coalesce(published_at, created_at) desc, created_at desc
      ) t
    `,
  );
}

function assertB2Config() {
  if (
    String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID ||
    !process.env.B2_APPLICATION_KEY
  ) throw new Error("B2_PUBLIC_INTELLIGENCE_CONFIG_REQUIRED");
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > REQUIRED_CATEGORIES.length * ROWS_PER_CATEGORY) {
    throw new Error("PUBLIC_INTELLIGENCE_ROW_COUNT_INVALID");
  }
  const seen = new Set();
  const categories = new Set();
  for (const row of rows) {
    const id = String(row?.id ?? "").trim();
    const title = String(row?.source_title ?? "").trim();
    const category = String(row?.category ?? "").trim();
    const severity = Number(row?.severity);
    if (!id || !title || !REQUIRED_CATEGORIES.includes(category)) {
      throw new Error("PUBLIC_INTELLIGENCE_ROW_SHAPE_INVALID");
    }
    if (!Number.isFinite(severity) || severity < 0 || severity > 100) {
      throw new Error("PUBLIC_INTELLIGENCE_UNSCORED_ROW_REJECTED");
    }
    const key = `${category}|${title.toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) throw new Error("PUBLIC_INTELLIGENCE_DUPLICATE_ROW");
    seen.add(key);
    categories.add(category);
  }
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) throw new Error(`PUBLIC_INTELLIGENCE_CATEGORY_MISSING_${category}`);
  }
}

const dbUrl = authoritativeDbUrl();
assertB2Config();
const rows = readScoredRows(dbUrl);
validateRows(rows);

const generatedAt = new Date().toISOString();
const value = {
  schema: "geomacro.public-intelligence-live.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  scoring_policy: "canonical-classifier-scored-only",
  classification_version: CLASSIFICATION_VERSION,
  rows,
};
const raw = Buffer.from(JSON.stringify(value));
const packed = gzipSync(raw, { level: 9 });
const digest = sha256(packed);

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

await b2.put(LIVE_KEY, packed);
const readback = await b2.get(LIVE_KEY);
if (readback.length !== packed.length || sha256(readback) !== digest) {
  throw new Error("B2_PUBLIC_INTELLIGENCE_HASH_INVALID");
}
let restored;
try {
  restored = JSON.parse(gunzipSync(readback).toString("utf8"));
} catch {
  throw new Error("B2_PUBLIC_INTELLIGENCE_RESTORE_INVALID");
}
validateRows(restored?.rows);
if (
  restored?.schema !== value.schema ||
  restored?.generated_at !== generatedAt ||
  restored?.source_project !== PROJECT_REF ||
  restored?.scoring_policy !== value.scoring_policy ||
  restored?.classification_version !== CLASSIFICATION_VERSION
) throw new Error("B2_PUBLIC_INTELLIGENCE_BINDING_INVALID");

const proof = Buffer.from(JSON.stringify({
  schema: "geomacro.public-intelligence-live-proof.v1",
  generated_at: generatedAt,
  source_project: PROJECT_REF,
  live_key: LIVE_KEY,
  classification_version: CLASSIFICATION_VERSION,
  categories: REQUIRED_CATEGORIES,
  row_count: rows.length,
  compressed_sha256: digest,
  compressed_bytes: packed.length,
  scored_only: true,
  full_b2_readback_verified: true,
  exact_gzip_restore_verified: true,
}));
await b2.put(PROOF_KEY, proof);
const proofReadback = await b2.get(PROOF_KEY);
if (sha256(proofReadback) !== sha256(proof)) {
  throw new Error("B2_PUBLIC_INTELLIGENCE_PROOF_READBACK_INVALID");
}

const newest = rows
  .map((row) => Date.parse(String(row.published_at ?? row.created_at ?? "")))
  .filter(Number.isFinite)
  .sort((a, b) => b - a)[0];

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.public-intelligence-direct-postgres-publish.v1",
  authority_read: "direct-postgres-read-only",
  authority_serve: "backblaze-b2",
  classification_version: CLASSIFICATION_VERSION,
  scored_only: true,
  categories: REQUIRED_CATEGORIES,
  rows_published: rows.length,
  newest_row_at: Number.isFinite(newest) ? new Date(newest).toISOString() : null,
  live_key: LIVE_KEY,
  proof_key: PROOF_KEY,
  live_sha256: digest,
  destructive_change: false,
  synthetic_score: false,
  b2_readback_verified: true,
}));
