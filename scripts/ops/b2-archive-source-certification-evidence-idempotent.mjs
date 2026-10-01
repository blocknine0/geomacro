#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const REQUIRED_ACK = "I_ACCEPT_VERIFIED_SOURCE_CERT_EVIDENCE_ARCHIVE_DELETE";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const ack = String(process.env.SOURCE_CERT_EVIDENCE_ARCHIVE_ACK ?? "").trim();
if (url !== PROJECT_URL || !role || ack !== REQUIRED_ACK) {
  throw new Error("SOURCE_CERT_EVIDENCE_ARCHIVE_CONFIG_INVALID");
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

async function countRows(table, runId) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("run_id", runId);
  if (error) throw new Error(`SOURCE_CERT_EVIDENCE_COUNT_FAILED_${table}_${error.code ?? "unknown"}`);
  return Number(count ?? 0);
}

const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const { data: runs, error: runError } = await db
  .from("live_source_certification_evidence_runs")
  .select("run_id,source_count,node_count,edge_count,source_promoted_count,path_promoted_count,blocked_source_count,created_at")
  .lt("created_at", cutoff)
  .gt("node_count", 0)
  .gt("edge_count", 0)
  .eq("source_promoted_count", 0)
  .eq("path_promoted_count", 0)
  .order("created_at", { ascending: true })
  .limit(20);
if (runError) throw new Error(`SOURCE_CERT_EVIDENCE_RUN_QUERY_FAILED_${runError.code ?? "unknown"}`);

const safeRuns = (runs ?? []).filter((row) =>
  Number(row.blocked_source_count ?? -1) === Number(row.source_count ?? -2) &&
  Number(row.node_count ?? 0) > 0 &&
  Number(row.edge_count ?? 0) > 0,
);
if (!safeRuns.length) {
  console.log(JSON.stringify({ ok: true, status: "complete", archived_runs: 0, reason: "no_safe_old_run", b2: b2.usage() }));
  process.exit(0);
}

const run = safeRuns[0];
const runId = String(run.run_id ?? "");
if (!/^source-evidence-[A-Za-z0-9-]+$/.test(runId)) throw new Error("SOURCE_CERT_EVIDENCE_RUN_ID_INVALID");

const [nodesBefore, edgesBefore] = await Promise.all([
  countRows("live_source_certification_evidence_nodes", runId),
  countRows("live_source_certification_evidence_edges", runId),
]);

if (nodesBefore === 0 && edgesBefore === 0) {
  const { data: archive, error: archiveError } = await db
    .from("live_source_certification_evidence_archives")
    .select("run_id,archive_key,archive_sha256,node_count,edge_count,verified_at")
    .eq("run_id", runId)
    .maybeSingle();
  if (archiveError || !archive) throw new Error("SOURCE_CERT_EVIDENCE_ALREADY_DELETED_WITHOUT_ARCHIVE_INDEX");

  const archiveKey = String(archive.archive_key ?? "");
  const archiveSha = String(archive.archive_sha256 ?? "");
  const expectedNodes = Number(run.node_count);
  const expectedEdges = Number(run.edge_count);
  if (
    archive.run_id !== runId ||
    !/^geomacro-evidence\/v1\/source-certification-evidence-runs\/[A-Za-z0-9-]+\/[0-9a-f]{64}\.json\.gz$/.test(archiveKey) ||
    !/^[0-9a-f]{64}$/.test(archiveSha) ||
    Number(archive.node_count) !== expectedNodes ||
    Number(archive.edge_count) !== expectedEdges ||
    !archive.verified_at
  ) throw new Error("SOURCE_CERT_EVIDENCE_ARCHIVE_INDEX_INVALID");

  const bytes = await b2.get(archiveKey);
  if (sha256(bytes) !== archiveSha) throw new Error("SOURCE_CERT_EVIDENCE_B2_HASH_INVALID");
  let restored;
  try { restored = JSON.parse(gunzipSync(bytes).toString("utf8")); }
  catch { throw new Error("SOURCE_CERT_EVIDENCE_B2_RESTORE_INVALID"); }

  if (
    restored?.schema !== "geomacro.source-certification-evidence-run-bundle.v1" ||
    String(restored?.run?.run_id ?? "") !== runId ||
    Number(restored?.node_count) !== expectedNodes ||
    Number(restored?.edge_count) !== expectedEdges ||
    !Array.isArray(restored?.nodes) || restored.nodes.length !== expectedNodes ||
    !Array.isArray(restored?.edges) || restored.edges.length !== expectedEdges
  ) throw new Error("SOURCE_CERT_EVIDENCE_B2_CONTENT_INVALID");

  const nodesSha = sha256(Buffer.from(stableJson(restored.nodes)));
  const edgesSha = sha256(Buffer.from(stableJson(restored.edges)));
  if (restored.nodes_sha256 !== nodesSha || restored.edges_sha256 !== edgesSha) {
    throw new Error("SOURCE_CERT_EVIDENCE_B2_MEMBER_HASH_INVALID");
  }

  const [nodesAfter, edgesAfter] = await Promise.all([
    countRows("live_source_certification_evidence_nodes", runId),
    countRows("live_source_certification_evidence_edges", runId),
  ]);
  if (nodesAfter !== 0 || edgesAfter !== 0) throw new Error("SOURCE_CERT_EVIDENCE_SOURCE_REAPPEARED");

  console.log(JSON.stringify({
    ok: true,
    status: "complete",
    archived_runs: 1,
    run_id: runId,
    already_archived: true,
    archive_index_verified: true,
    full_b2_readback_verified: true,
    restore_and_member_set_verified: true,
    db_source_rows_absent: true,
    archive_key: archiveKey,
    archive_sha256: archiveSha,
    node_count: expectedNodes,
    edge_count: expectedEdges,
    b2: b2.usage(),
  }));
  process.exit(0);
}

if (nodesBefore === 0 || edgesBefore === 0) {
  throw new Error("SOURCE_CERT_EVIDENCE_PARTIAL_SOURCE_STATE");
}

await import("./b2-archive-source-certification-evidence-run.mjs");
