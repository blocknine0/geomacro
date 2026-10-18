import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {inspectExistingGriHistoricalRow} from "../../scripts/ops/preflight-gri-historical-existing-d1.mjs";
const now=new Date("2026-10-18T12:00:00.000Z");
const sha="a".repeat(64),payload="b".repeat(64);
const anchor={
 schema:"geomacro.global-risk-b2-anchor.v1",product:"global-risk",ok:true,
 b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
 b2_sha256:sha,payload_sha256:payload,generated_at:"2026-10-08T06:39:43.490Z",
 source_run_id:"123456789",baseline_b2_readback_verified:true,
 baseline_exact_gzip_restore_verified:true,
 anchor_kind:"prior_b2_baseline_of_independent_gri_proof",
};
const env={GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY:"1",
 B2_ACCOUNT_QUOTA_REQUIRED:"1",
 B2_ACCOUNT_QUOTA_WORKFLOW_ID:"historical_gri_version_recovery",
 B2_REQUEST_BUDGET:"4"};
const existing={source_as_of:"2026-10-08T06:30:00.000Z",
 b2_sha256:sha,payload_sha256:payload,
 original_generated_at:anchor.generated_at,
 proof_schema:"geomacro.public-global-risk-live-proof.v1"};
function setup(rows:unknown[]=[]){
 const getAnchor=vi.fn(async()=>anchor),query=vi.fn(async(sql:string,params:any[])=>{
  expect(sql.trimStart()).toMatch(/^SELECT source_as_of,b2_sha256/u);
  expect(sql).toContain("LIMIT 2");
  expect(params).toEqual([sha,payload,anchor.generated_at]);
  return rows;
 });
 return {env,now,getAnchor,query};
}
describe("prior pinned GRI historical D1 idempotence",()=>{
 it("reads exactly a trusted prior anchor and one bound D1 SELECT; skips B2 replay when present",async()=>{
  const d=setup([existing]);
  const r=await inspectExistingGriHistoricalRow(d);
  expect(r.already_present).toBe(true);
  expect(r.status).toBe("PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY");
  expect(r.historical_b2_readback_now_verified).toBe(false);
  expect(r.multi_snapshot_lineage_now_verified).toBe(false);
  expect(r.current_scored_gri_published).toBe(false);
  expect(r.b2_requests+r.d1_writes+r.payments).toBe(0);
  expect(d.getAnchor).toHaveBeenCalledOnce();
  expect(d.query).toHaveBeenCalledOnce();
  expect(JSON.stringify(r)).not.toContain("geomacro-evidence/v1/live/global-risk");
 });
 it("admits guarded restore ONLY when the exact anchored row is absent",async()=>{
  const d=setup();
  const r=await inspectExistingGriHistoricalRow(d);
  expect(r.already_present).toBe(false);
  expect(r.status).toBe("PINNED_HISTORICAL_D1_ROW_ABSENT_REQUIRES_B2_PROOF");
  expect(r.historical_b2_readback_now_verified).toBe(false);
 });
 it("rejects conflicting D1 data, duplicates and unproven anchored metadata",async()=>{
  for(const rows of [
   [existing,existing],
   [{...existing,b2_sha256:"c".repeat(64)}],
   [{...existing,source_as_of:"2026-10-09T09:00:00Z"}],
   [{...existing,proof_schema:"foo"}],
  ])await expect(inspectExistingGriHistoricalRow(setup(rows))).rejects.toThrow();
  const d=setup([existing]);
  await expect(inspectExistingGriHistoricalRow({...d,getAnchor:vi.fn(async()=>({...anchor,b2_sha256:"not-sha"}))})).rejects.toThrow();
  expect(d.query).not.toHaveBeenCalled();
 });
 it("refuses ungoverned restores, payment config, and frozen Supabase",async()=>{
  const d=setup();
  await expect(inspectExistingGriHistoricalRow({...d,env:{...env,COINBASE_X402_MAINNET_ACK:"YES"}})).rejects.toThrow();
  await expect(inspectExistingGriHistoricalRow({...d,env:{...env,SUPABASE_DB_URL:"bad"}})).rejects.toThrow();
  expect(d.getAnchor).not.toHaveBeenCalled();
  expect(d.query).not.toHaveBeenCalled();
 });
 it("runs exact D1-idempotence check before spending any B2 quota ticket",()=>{
  const w=readFileSync(".github/workflows/gri-pinned-version-recovery.yml","utf8");
  const a=w.indexOf("id: gri_history_existing");
  const b=w.indexOf("id: gri_history_quota");
  const c=w.indexOf("run: node scripts/ops/restore-gri-verified-version-to-d1.mjs");
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  expect(c).toBeGreaterThan(b);
  expect(w).toContain("steps.gri_history_existing.outputs.already_restored != 'true'");
  expect(w).toContain("GRI_HISTORY_PINNED_D1_ALREADY_RESTORED_NO_B2_REPLAY");
  expect(w).toContain("GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY");
 });
});
