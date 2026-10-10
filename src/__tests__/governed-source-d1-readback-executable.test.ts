import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  verifyGovernedD1CheckpointReadback,
} from "../../scripts/ops/verify-governed-d1-checkpoint.mjs";

const now="2026-10-10T04:39:21.122Z";
const hash="a".repeat(64);
const fingerprint="b".repeat(64);
const role="historical_or_latest_native_statistical_measurements_only";
function fixture() {
  const sources=[
    {
      source_id:"eia_api_v2",data_categories:["MACRO"],
      earliest_source_observed_at:"2026-06-01T00:00:00.000Z",
      latest_source_observed_at:"2026-07-01T00:00:00.000Z",
      latest_native_observation_lag_days:101,
    },
    {
      source_id:"noaa_ncei_cdo_api",data_categories:["MULTI_DOMAIN"],
      earliest_source_observed_at:"2026-09-24T00:00:00.000Z",
      latest_source_observed_at:"2026-09-24T00:00:00.000Z",
      latest_native_observation_lag_days:16,
    },
  ].map((p,i)=>({
    ...p,normalized_observations:i?25:12,
    fragment_count:1,
    fragment_set_sha256:i?"c".repeat(64):hash,
    fragments:[{
      key:"geomacro-evidence/v1/observation-bundles/20260924T000000Z-"+i+".json.gz",
      sha256:i?"d".repeat(64):fingerprint,
      fingerprint:fingerprint,
      members:i?25:12,
    }],
    publisher_article_published_at_verified:false,
    current_intelligence_available:false,
    current_commercial_signal_eligible:false,
    checked_at_is_not_source_observed_at:true,
    source_data_role:role,
  }));
  const summary={
    schema:"geomacro.governed-b2-first-ingestion.v2",
    status:"PASS",
    ingested_at:now,
    durable_payload_store:"backblaze-b2",
    normalized_data_store:"backblaze-b2",
    compact_control_store:"cloudflare-d1",
    supabase_dependency:false,
    payment_performed:false,
    destructive_change:false,
    b2_usage:{global_account_quota_guard_enabled:true,requests_started:4},
    sources,
  };
  const rows=sources.map(s=>({
    pipeline:"governed_source_ingestion",
    scope:s.source_id,status:"PASS",
    cursor:s.fragment_set_sha256,
    metadata_json:JSON.stringify({
      ...s,
      durable_payload_store:"backblaze-b2",
      normalized_data_store:"backblaze-b2",
      compact_control_store:"cloudflare-d1",
      storage_mode:"gzip-fragment-bundles",
      compression:"gzip-9",
      b2_storage_metadata_verified:true,
      b2_local_restore_verified:true,
      b2_full_body_readback_verified:true,
      verification_mode:"signed-put-full-readback-sha256",
      normalized_observations_durable_in_b2:true,
      supabase_dependency:false,
    }),
  }));
  return {summary,databaseResponse:[{results:rows}]};
}

describe("#1827 executable production governed D1 historical source readback",()=>{
  it("accepts exactly 2 D1 original-archive SHA-bound checkpoints with true source clocks",()=>{
    const f=fixture();
    const result=verifyGovernedD1CheckpointReadback(
      f.databaseResponse,f.summary);
    expect(result).toMatchObject({
      ok:true,source_count:2,private_archive_verified:true,
      source_news_publication_verified:false,
      current_intelligence_available:false,commercial_eligible:false,
      supabase_writes:0,b2_requests:0,d1_writes:0,usdc_spent:0,
    });
    expect(JSON.stringify(result)).not.toContain("observation-bundles");
    expect(JSON.stringify(result)).not.toContain("source_url");
    expect(JSON.stringify(result)).not.toContain("private_key");
  });

  it("never accepts false account-wide B2 budget proof or a chargeable/current output",()=>{
    const f=fixture();
    f.summary.b2_usage.global_account_quota_guard_enabled=false;
    expect(()=>verifyGovernedD1CheckpointReadback(
      f.databaseResponse,f.summary)).toThrow(
        "GOVERNED_D1_ORIGINAL_VERIFIED_B2_SUMMARY_REQUIRED");
    const g=fixture();
    g.summary.b2_usage.requests_started=81;
    expect(()=>verifyGovernedD1CheckpointReadback(
      g.databaseResponse,g.summary)).toThrow();
    const h=fixture();
    h.summary.payment_performed=true;
    expect(()=>verifyGovernedD1CheckpointReadback(
      h.databaseResponse,h.summary)).toThrow();
  });

  it("rejects wrong EIA electricity category, NOAA time, SHA cursor, B2 fragment or missing scope",()=>{
    const cases=[
      (f:ReturnType<typeof fixture>)=>{
        f.summary.sources[0].data_categories=["CRITICAL_MINERALS"];
      },
      (f:ReturnType<typeof fixture>)=>{
        f.summary.sources[1].latest_source_observed_at=
          "2026-10-15T00:00:00.000Z";
      },
      (f:ReturnType<typeof fixture>)=>{
        f.databaseResponse[0].results[0].cursor="0".repeat(64);
      },
      (f:ReturnType<typeof fixture>)=>{
        const row=f.databaseResponse[0].results[1];
        const m=JSON.parse(row.metadata_json);
        m.fragments[0].sha256="0".repeat(64);
        row.metadata_json=JSON.stringify(m);
      },
      (f:ReturnType<typeof fixture>)=>{
        f.databaseResponse[0].results.pop();
      },
      (f:ReturnType<typeof fixture>)=>{
        const row=f.databaseResponse[0].results[0];
        const m=JSON.parse(row.metadata_json);
        m.current_commercial_signal_eligible=true;
        row.metadata_json=JSON.stringify(m);
      },
    ];
    for(const mutate of cases) {
      const f=fixture();
      mutate(f);
      expect(()=>verifyGovernedD1CheckpointReadback(
        f.databaseResponse,f.summary)).toThrow();
    }
  });

  it("executes actual Node CLI with piped remote D1 JSON; no bash-quote helper calls",()=>{
    const root=mkdtempSync(join(tmpdir(),"geomacro-governed-d1-verifier-"));
    try {
      const path=join(root,"artifacts/governed-source-ingestion");
      mkdirSync(path,{recursive:true});
      const f=fixture();
      writeFileSync(join(path,"verification-summary.json"),JSON.stringify(f.summary));
      const exe=resolve("scripts/ops/verify-governed-d1-checkpoint.mjs");
      const args={cwd:root,encoding:"utf8" as const,timeout:10000,
        input:JSON.stringify(f.databaseResponse),env:{PATH:process.env.PATH}};
      const result=spawnSync(process.execPath,[exe],args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout).private_archive_verified).toBe(true);
      expect(result.stdout).not.toContain("source_url");
      expect(result.stdout).not.toContain("observation-bundles");
      const bad=fixture();
      const row=bad.databaseResponse[0].results[0];
      const m=JSON.parse(row.metadata_json);
      m.latest_source_observed_at="2026-10-10T04:39:21.122Z";
      row.metadata_json=JSON.stringify(m);
      const fail=spawnSync(process.execPath,[exe],{
        ...args,input:JSON.stringify(bad.databaseResponse),
      });
      expect(fail.status).not.toBe(0);
      expect(fail.stdout).toBe("");
      expect(fail.stderr).toContain("GOVERNED_D1_STATISTIC_SOURCE_CLOCK_OR_CATEGORY_MISMATCH");
    } finally {rmSync(root,{recursive:true,force:true});}
  });

  it("workflow keeps real schema-v5 account quota preflight and uses only external verifier in D1 readback",()=>{
    const workflow=readFileSync(".github/workflows/governed-source-ingestion.yml","utf8");
    const st=workflow.indexOf("      - name: Verify D1 checkpoint readback");
    const en=workflow.indexOf("      - name: Upload bounded ingestion evidence",st);
    expect(st).toBeGreaterThan(0);
    expect(en).toBeGreaterThan(st);
    const check=workflow.slice(st,en);
    expect(check).toContain("node scripts/ops/verify-governed-d1-checkpoint.mjs");
    expect(check).not.toContain("| node -e '");
    expect(check).toContain('printf \'%s\' "$OUT" > artifacts/governed-source-ingestion/d1-readback.json');
    expect(workflow).toContain("Require D1 schema v5 and account B2 quota ledger before source reads");
    expect(workflow).toContain("GOVERNED_INGESTION_SHARED_B2_D1_SCHEMA_V5_REQUIRED");
    expect(workflow).toContain("Number(rows[0]?.quota_table) !== 1");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_WORKFLOW_ID: governed_source_ingestion');
    expect(workflow).toContain("scripts/ops/verify-governed-d1-checkpoint.mjs");
  });
});
