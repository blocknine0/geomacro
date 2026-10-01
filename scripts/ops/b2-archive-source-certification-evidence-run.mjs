#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const ARCHIVE_BUCKET = "geomacro-private-archive";
const REQUIRED_ACK = "I_ACCEPT_VERIFIED_SOURCE_CERT_EVIDENCE_ARCHIVE_DELETE";
const PAGE_SIZE = 1000;
const MAX_RAW_BYTES = 40_000_000;
const MAX_COMPRESSED_BYTES = 12_000_000;
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

const db = createClient(url, role, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const b2 = createB2Client({
  endpointUrl: process.env.B2_S3_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: ARCHIVE_BUCKET,
});

async function readAll(table, runId, orderColumn) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("run_id", runId)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`SOURCE_CERT_EVIDENCE_READ_FAILED_${table}_${error.code ?? "unknown"}`);
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function countRows(table, runId) {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("run_id", runId);
  if (error) throw new Error(`SOURCE_CERT_EVIDENCE_COUNT_FAILED_${table}_${error.code ?? "unknown"}`);
  return Number(count ?? 0);
}

async function upsertChunked(table, rows, conflictColumn) {
  for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) {
    const chunk = rows.slice(offset, offset + PAGE_SIZE);
    const { error } = await db.from(table).upsert(chunk, { onConflict: conflictColumn });
    if (error) throw new Error(`SOURCE_CERT_EVIDENCE_RESTORE_FAILED_${table}_${error.code ?? "unknown"}`);
  }
}

function idsMatch(deleted, expected, key) {
  const got = (deleted ?? []).map((row) => String(row?.[key] ?? "")).sort();
  const want = expected.map((row) => String(row?.[key] ?? "")).sort();
  return got.length === want.length && got.every((value, index) => value === want[index]);
}

const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const { data: runs, error: runError } = await db
  .from("live_source_certification_evidence_runs")
  .select("run_id,code_revision,evaluated_at,source_count,node_count,edge_count,source_eligible_count,source_promoted_count,path_promoted_count,blocked_source_count,write_operations_performed,created_at")
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
  console.log(JSON.stringify({ ok: true, status: "complete", archived_runs: 0, b2: b2.usage() }));
  process.exit(0);
}

const run = safeRuns[0];
const runId = String(run.run_id);
if (!/^source-evidence-[A-Za-z0-9-]+$/.test(runId)) {
  throw new Error("SOURCE_CERT_EVIDENCE_RUN_ID_INVALID");
}

const nodes = await readAll("live_source_certification_evidence_nodes", runId, "evidence_id");
const edges = await readAll("live_source_certification_evidence_edges", runId, "edge_id");
const expectedNodes = Number(run.node_count);
const expectedEdges = Number(run.edge_count);
if (nodes.length !== expectedNodes || edges.length !== expectedEdges) {
  throw new Error("SOURCE_CERT_EVIDENCE_SOURCE_COUNT_CHANGED");
}

const nodesSha = sha256(Buffer.from(stableJson(nodes)));
const edgesSha = sha256(Buffer.from(stableJson(edges)));
const envelope = {
  schema: "geomacro.source-certification-evidence-run-bundle.v1",
  run,
  node_count: nodes.length,
  edge_count: edges.length,
  nodes_sha256: nodesSha,
  edges_sha256: edgesSha,
  archived_at: new Date().toISOString(),
  nodes,
  edges,
};
const raw = Buffer.from(JSON.stringify(envelope));
if (raw.length > MAX_RAW_BYTES) throw new Error("SOURCE_CERT_EVIDENCE_ARCHIVE_TOO_LARGE");
const compressed = gzipSync(raw, { level: 9 });
if (compressed.length > MAX_COMPRESSED_BYTES) throw new Error("SOURCE_CERT_EVIDENCE_ARCHIVE_COMPRESSED_TOO_LARGE");
const bundleSha = sha256(compressed);
const archiveKey = `geomacro-evidence/v1/source-certification-evidence-runs/${runId}/${bundleSha}.json.gz`;

function verifyBundle(bytes) {
  if (sha256(bytes) !== bundleSha) throw new Error("SOURCE_CERT_EVIDENCE_B2_HASH_INVALID");
  let restored;
  try {
    restored = JSON.parse(gunzipSync(bytes).toString("utf8"));
  } catch {
    throw new Error("SOURCE_CERT_EVIDENCE_B2_RESTORE_INVALID");
  }
  if (
    restored?.schema !== "geomacro.source-certification-evidence-run-bundle.v1" ||
    String(restored?.run?.run_id ?? "") !== runId ||
    Number(restored?.node_count) !== expectedNodes ||
    Number(restored?.edge_count) !== expectedEdges ||
    !Array.isArray(restored?.nodes) || !Array.isArray(restored?.edges) ||
    restored.nodes.length !== expectedNodes || restored.edges.length !== expectedEdges ||
    sha256(Buffer.from(stableJson(restored.nodes))) !== nodesSha ||
    sha256(Buffer.from(stableJson(restored.edges))) !== edgesSha ||
    restored.nodes_sha256 !== nodesSha || restored.edges_sha256 !== edgesSha
  ) {
    throw new Error("SOURCE_CERT_EVIDENCE_B2_CONTENT_INVALID");
  }
  return restored;
}

async function verifySourceMatchesExpected() {
  const currentNodes = await readAll("live_source_certification_evidence_nodes", runId, "evidence_id");
  const currentEdges = await readAll("live_source_certification_evidence_edges", runId, "edge_id");
  if (
    currentNodes.length !== expectedNodes ||
    currentEdges.length !== expectedEdges ||
    sha256(Buffer.from(stableJson(currentNodes))) !== nodesSha ||
    sha256(Buffer.from(stableJson(currentEdges))) !== edgesSha
  ) throw new Error("SOURCE_CERT_EVIDENCE_SOURCE_CHANGED");
}

async function restoreSourceRows(originalCause) {
  try {
    await upsertChunked("live_source_certification_evidence_nodes", nodes, "evidence_id");
    await upsertChunked("live_source_certification_evidence_edges", edges, "edge_id");
    await verifySourceMatchesExpected();
  } catch (rollbackCause) {
    throw new Error("SOURCE_CERT_EVIDENCE_ROLLBACK_FAILED", { cause: rollbackCause ?? originalCause });
  }
}

await b2.put(archiveKey, compressed);
verifyBundle(await b2.get(archiveKey));

const verifiedAt = new Date().toISOString();
const { error: indexError } = await db
  .from("live_source_certification_evidence_archives")
  .upsert({
    run_id: runId,
    archive_key: archiveKey,
    archive_sha256: bundleSha,
    node_count: expectedNodes,
    edge_count: expectedEdges,
    verified_at: verifiedAt,
  }, { onConflict: "run_id" });
if (indexError) throw new Error(`SOURCE_CERT_EVIDENCE_ARCHIVE_INDEX_FAILED_${indexError.code ?? "unknown"}`);

verifyBundle(await b2.get(archiveKey));
await verifySourceMatchesExpected();

const { data: indexed, error: indexedError } = await db
  .from("live_source_certification_evidence_archives")
  .select("run_id,archive_key,archive_sha256,node_count,edge_count")
  .eq("run_id", runId)
  .single();
if (
  indexedError ||
  indexed?.run_id !== runId ||
  indexed?.archive_key !== archiveKey ||
  indexed?.archive_sha256 !== bundleSha ||
  Number(indexed?.node_count) !== expectedNodes ||
  Number(indexed?.edge_count) !== expectedEdges
) throw new Error("SOURCE_CERT_EVIDENCE_ARCHIVE_INDEX_MISMATCH");

let cleanupStarted = false;
try {
  cleanupStarted = true;
  const { data: deletedEdges, error: deleteEdgesError } = await db
    .from("live_source_certification_evidence_edges")
    .delete()
    .eq("run_id", runId)
    .select("edge_id");
  if (deleteEdgesError || !idsMatch(deletedEdges, edges, "edge_id")) {
    throw new Error(`SOURCE_CERT_EVIDENCE_EDGE_DELETE_UNCONFIRMED_${deleteEdgesError?.code ?? "count"}`);
  }

  const { data: deletedNodes, error: deleteNodesError } = await db
    .from("live_source_certification_evidence_nodes")
    .delete()
    .eq("run_id", runId)
    .select("evidence_id");
  if (deleteNodesError || !idsMatch(deletedNodes, nodes, "evidence_id")) {
    throw new Error(`SOURCE_CERT_EVIDENCE_NODE_DELETE_UNCONFIRMED_${deleteNodesError?.code ?? "count"}`);
  }

  const [nodesAfter, edgesAfter] = await Promise.all([
    countRows("live_source_certification_evidence_nodes", runId),
    countRows("live_source_certification_evidence_edges", runId),
  ]);
  if (nodesAfter !== 0 || edgesAfter !== 0) throw new Error("SOURCE_CERT_EVIDENCE_SOURCE_STILL_PRESENT");

  verifyBundle(await b2.get(archiveKey));
} catch (cause) {
  if (cleanupStarted) await restoreSourceRows(cause);
  throw cause;
}

const proofKey = `geomacro-evidence/v1/index/source-certification-evidence-runs/${runId}-${bundleSha}.json`;
const proof = {
  schema: "geomacro.source-certification-evidence-run-archive-proof.v1",
  run_id: runId,
  archive_bucket: ARCHIVE_BUCKET,
  archive_key: archiveKey,
  archive_sha256: bundleSha,
  node_count: expectedNodes,
  edge_count: expectedEdges,
  nodes_sha256: nodesSha,
  edges_sha256: edgesSha,
  full_b2_readback_verified_before_index: true,
  full_b2_readback_verified_before_delete: true,
  full_b2_readback_verified_after_delete: true,
  restore_and_member_set_verified: true,
  db_source_rows_absent_after_cleanup: true,
  cleanup_mode: "application-side-exact-member-delete-with-rollback",
  rollback_member_set_retained_in_memory: true,
  run_summary_retained: true,
  verified_at: new Date().toISOString(),
};
await b2.put(proofKey, Buffer.from(JSON.stringify(proof)));

console.log(JSON.stringify({
  ok: true,
  status: "progress",
  ...proof,
  compressed_bytes: compressed.length,
  raw_bytes: raw.length,
  b2: b2.usage(),
}));
