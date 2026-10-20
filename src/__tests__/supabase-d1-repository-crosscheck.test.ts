import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {inventorySupabaseRepositoryCutover} from "../../scripts/ops/inventory-supabase-d1-repository-crosscheck.mjs";

describe("Supabase to Cloudflare D1 full repository source dependency audit",()=>{
 const report=inventorySupabaseRepositoryCutover();
 it("enumerates the large real source tree, not a fixed cherry-picked list",()=>{
  expect(report.file_count).toBeGreaterThan(500);
  expect(report.repo_static_reference_count).toBeGreaterThan(50);
  expect(report.route_entrypoints_scanned).toBeGreaterThan(40);
  expect(report.workflow_files).toBeGreaterThanOrEqual(250);
 });
 it("does not confuse GitHub grep, test fixtures or frozen workflows with live acceptance",()=>{
  expect(report.currently_serving_supabase_runtime_calls_proven_absent).toBe(false);
  expect(report.all_supabase_data_migrated_to_d1_proven).toBe(false);
  expect(report.legacy_payment_and_customer_records_safely_reconciled).toBe(false);
  expect(report.supabase_requests).toBe(0);
  expect(report.d1_writes).toBe(0);
  expect(report.b2_requests).toBe(0);
  expect(report.payments).toBe(0);
 });
 it("identifies retained payment, API entitlement, source and archive dependencies",()=>{
  const names=report.findings.map(x=>x.path);
  for(const p of [
   "src/lib/risk-supabase.server.ts",
   "src/lib/supabase-app.server.ts",
   "scripts/lib/gri-db-client.mjs",
   "scripts/ops/publish-country-gro-hot-bundle.ts",
   "src/lib/commercial-access.server.ts",
   "src/lib/coinbase-x402.server.ts",
  ])expect(names).toContain(p);
 });
 it("tracks imports of public routes rather than declaring everything Supabase-free",()=>{
  expect(report.request_paths.length).toBeGreaterThan(1);
  const paths=report.request_paths.flatMap(x=>x.supabase_related_import_or_direct_match);
  expect(paths.some(x=>x.path==="src/lib/risk-supabase.server.ts")).toBe(true);
  expect(report.request_paths.every(x=>x.dependency_proven_at_runtime===false)).toBe(true);
 });
 it("keeps the verified D1 news and Risk Gate migration paths unchanged",()=>{
  const gate=readFileSync("src/routes/api.risk-gate.ts","utf8");
  const read=readFileSync("src/routes/api.risk-gate-readiness.ts","utf8");
  const worker=readFileSync("workers/control-plane/src/shared-derived-news-feed.mjs","utf8");
  expect(gate).toContain("forwardRiskGateToD1");
  expect(read).toContain("readD1RiskGateReadiness");
  expect(worker).toContain("SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE");
 });
});
