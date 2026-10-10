import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const legacyGri=read(".github/workflows/gri-realtime-direct-postgres.yml");
const legacyB2=read(".github/workflows/b2-global-risk-maintenance.yml");
const canonicalIngestion=read(".github/workflows/intelligence-orchestrator.yml");
const publisher=read("scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
const preflight=read("scripts/lib/global-risk-hot-source-preflight.mjs");
const offline=read("scripts/ops/compute-supabase-free-private-gri-v12.mjs");
const archive=read("scripts/ops/archive-supabase-free-private-gri-v12.mjs");

describe("#1827 frozen Supabase GRI quota hold (no fake currentness)",()=>{
  it.each([
    ["hourly PostgreSQL GRI",legacyGri],
    ["two-hour B2 Global Risk republisher",legacyB2],
  ])("%s has no automatic quota-consuming trigger until source recovery",(_name,yaml)=>{
    expect(yaml).toContain("workflow_dispatch: {}");
    expect(yaml).not.toContain("\n  schedule:\n");
    expect(yaml).not.toContain("\n  push:\n");
    expect(yaml).not.toContain("\n  workflow_run:\n");
    expect(yaml).toContain("github.ref == 'refs/heads/main'");
    expect(yaml).toContain("github.event_name == 'workflow_dispatch'");
    expect(yaml).not.toContain("execution_authorized=true");
  });

  it("still protects the frozen Supabase before any legacy correlation or GRI writer",()=>{
    const guard=legacyGri.indexOf("Enforce canonical Supabase budget before every GRI writer");
    const correlation=legacyGri.indexOf("Correlate current canonical evidence through direct PostgreSQL");
    const compute=legacyGri.indexOf("Compute current verified three-domain GRI");
    expect(guard).toBeGreaterThan(0);
    expect(correlation).toBeGreaterThan(guard);
    expect(compute).toBeGreaterThan(correlation);
    expect(legacyGri).toContain("--require-bulk-write --require-normal");
    expect(legacyGri).toContain("Independently verify current GRI proof package");
    expect(legacyGri).toContain("Publish verified Global Risk continuity package to B2");
  });

  it("preserves fail-closed current as-of proof without re-dating existing B2 history",()=>{
    expect(publisher).toContain("assertCurrentGlobalRiskSourceForHotPublish(latestSnapshot.as_of)");
    expect(preflight).toContain("GLOBAL_RISK_SOURCE_STALE_FOR_D1_HOT_PUBLISH");
    expect(legacyB2).toContain("verify-global-risk-public-convergence.mjs");
    expect(legacyB2).toContain("publish-b2-global-risk-direct-postgres.mjs");
    expect(offline).toContain("--private-stage-only");
    expect(archive).toContain("--private-archive-only");
    expect(archive).toContain('process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1"');
    expect(archive).not.toContain("publishVerifiedCurrentGlobalRiskHotSnapshot");
  });

  it("keeps a bounded offset 90-minute D1 orchestrator while Supabase remains frozen",()=>{
    expect(canonicalIngestion).toContain('cron: "47 0,3,6,9,12,15,18,21 * * *"');
    expect(canonicalIngestion).toContain('cron: "17 2,5,8,11,14,17,20,23 * * *"');
    expect(canonicalIngestion).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(canonicalIngestion).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: intelligence_orchestrator");
    expect(canonicalIngestion).toContain('GEOMACRO_SUPABASE_RESTRICTED_MODE: "true"');
  });
});
