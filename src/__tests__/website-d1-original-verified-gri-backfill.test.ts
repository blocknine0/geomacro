import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const sql=readFileSync(
  "workers/control-plane/migrations/0016_backfill_existing_verified_gri_to_website_ring.sql","utf8");
const deploy=readFileSync(".github/workflows/deploy-d1-control-plane.yml","utf8");
const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");

describe("website GRI Supabase-outage bounded verified preexisting D1 backfill",()=>{
 it("only copies an existing independently DIRECT B2-verified public GRI artifact",()=>{
  expect(sql).toContain("INSERT OR IGNORE INTO website_verified_gri_snapshot_history");
  expect(sql).toContain("FROM public_b2_hot_snapshot");
  expect(sql).toContain("proof_schema='geomacro.public-global-risk-live-proof.v1'");
  expect(sql).toContain("schema_name='geomacro.public-global-risk-live.v1'");
  expect(sql).toContain("product='global-risk'");
  expect(sql).toContain("julianday('now','-1 hour')");
  expect(sql).toContain("julianday('now','-30 days')");
  expect(sql).toContain("LIMIT 1;");
  expect(sql).toContain("length(payload_json) BETWEEN 2 AND 786432");
  expect(sql).not.toContain("gri_snapshots");
  expect(sql).not.toContain("SupabaseClient");
  expect(sql).not.toContain("B2_KEY_ID");
  expect(sql).not.toContain("fake");
 });
 it("retains <=12 ring entries/30d while historic originals keep real timestamps and checksum",()=>{
  expect(sql).toContain("DELETE FROM website_verified_gri_snapshot_history");
  expect(sql).toContain("'-30 days'");
  expect(sql).toContain("ORDER BY source_as_of DESC LIMIT 12");
  expect(sql).toContain("payload_sha256,b2_sha256");
  expect(sql).toContain("original_generated_at");
  expect(sql).toContain("original_verified_at");
  expect(worker).toContain("hex!==row.payload_sha256");
  expect(worker).toContain("privateVerifiedGriHistoryProjection(row,{now})");
 });
 it("recovers a previously verified hot original on read after it becomes 60m old, no new quotas",()=>{
  const begin=worker.indexOf("async function getWebsiteLaggedGriHistory(");
  const end=worker.indexOf("async function getPublicHotSnapshot(",begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const reader=worker.slice(begin,end);
  expect(reader).toContain("FROM website_verified_gri_snapshot_history");
  expect(reader).toContain("FROM public_b2_hot_snapshot");
  expect(reader).toContain("source_as_of<=?");
  expect(reader).toContain("proof_schema='geomacro.public-global-risk-live-proof.v1'");
  expect(reader).toContain("schema_name='geomacro.public-global-risk-live.v1'");
  expect(reader).toContain('HOT_SNAPSHOT_PRODUCTS["global-risk"].b2Key');
  expect(reader).toContain("actual===previous.payload_sha256");
  expect(reader).toContain("privateVerifiedGriHistoryProjection(previous,{now})");
  expect(reader).not.toContain("INSERT");
  expect(reader).not.toContain("UPDATE");
  expect(reader).not.toContain("DELETE");
  expect(reader).not.toContain("signedGet(");
  expect(reader).not.toContain("fetch(");
  expect(reader).not.toContain("getAppSupabase");
  expect(reader).toContain("WEBSITE_GRI_60MIN_VERIFIED_HISTORY_NOT_FOUND");
 });
 it("production deploy tests genuine redacted delayed GRI or explicit empty D1 without charging",()=>{
  expect(deploy).toContain("/v1/public/website-lagged-global-risk");
  expect(deploy).toContain('code="$(curl -sS -o /tmp/website-gri-delayed.json');
  expect(deploy).toContain('if [ "$code" = "200" ]; then');
  expect(deploy).toContain('elif [ "$code" = "503" ]; then');
  expect(deploy).toContain('WEBSITE_GRI_60MIN_VERIFIED_HISTORY_NOT_FOUND');
  expect(deploy).toContain('.minimum_delay_minutes == 60');
  expect(deploy).toContain('.prior_b2_readback_verified_at_write == true');
  expect(deploy).toContain('.independently_rechecked_b2_now == false');
  expect(deploy).toContain('.source_identity_disclosed == false');
  expect(deploy).toContain('.paid_delivery_authorized == false');
  expect(deploy).toContain('.chargeable == false');
  const paid=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
  expect(paid).not.toContain("website-lagged-global-risk");
 });
});
