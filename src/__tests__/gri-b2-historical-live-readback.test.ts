import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {verifyPinnedGlobalRiskBaseline} from "../../scripts/ops/verify-global-risk-b2-historical-readback.mjs";
const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const now=new Date("2026-10-15T13:00:00.000Z");
const value={
  schema:"geomacro.public-global-risk-live.v1",
  generated_at:"2026-10-12T10:00:00.000Z",
  source_project:"ldpwajisioljyjtojvfx",
  data:{
    snapshotAsOf:"2026-10-12T09:40:00.000Z",
    verificationStatus:"verified",auditPersisted:true,
    methodologyVersion:"gri-v1.2.0",
  },
};
const plain=Buffer.from(JSON.stringify(value));
const bytes=gzipSync(plain,{mtime:0});
const anchor={
  schema:"geomacro.global-risk-b2-anchor.v1",product:"global-risk",ok:true,
  b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
  b2_sha256:sha(bytes),payload_sha256:sha(plain),
  generated_at:value.generated_at,source_run_id:"38512345678",
  baseline_b2_readback_verified:true,baseline_exact_gzip_restore_verified:true,
};
describe("GRI historical B2 actual independent GET readback",()=>{
  it("verifies the exact compressed original and never asserts a new signed current risk",()=>{
    const receipt=verifyPinnedGlobalRiskBaseline({anchor,compressed:bytes,now});
    expect(receipt).toMatchObject({
      actual_b2_get_verified:true,exact_gzip_restore_verified:true,
      immutable_historical_lineage_verified:false,
      current_gri_qualified:false,paid_intelligence_available:false,
      original_historical_baseline_only:true,
      supabase_network_attempts:0,d1_writes:0,b2_puts:0,x402_charges:0,
    });
    expect(receipt).not.toHaveProperty("original_data");
    expect(receipt).not.toHaveProperty("source_url");
    expect(receipt).not.toHaveProperty("b2_object_key");
  });
  it("rejects overwritten B2 latest, bogus hash, corrupt gzip, future and expired archive clocks",()=>{
    const damaged=Buffer.from(bytes);damaged[damaged.length-1]^=0xff;
    expect(()=>verifyPinnedGlobalRiskBaseline({anchor,compressed:damaged,now}))
      .toThrow("HISTORICAL_GRI_B2_COMPRESSED_B2_READBACK_SHA_MISMATCH");
    expect(()=>verifyPinnedGlobalRiskBaseline({
      anchor:{...anchor,b2_sha256:"a".repeat(64)},compressed:bytes,now,
    })).toThrow();
    const future={...anchor,generated_at:"2026-10-16T13:00:00.000Z"};
    expect(()=>verifyPinnedGlobalRiskBaseline({anchor:future,compressed:bytes,now})).toThrow();
    expect(()=>verifyPinnedGlobalRiskBaseline({
      anchor,compressed:bytes,now:new Date("2026-12-15T13:00:00.000Z"),
    })).toThrow();
    expect(()=>verifyPinnedGlobalRiskBaseline({
      anchor:{...anchor,baseline_exact_gzip_restore_verified:false},compressed:bytes,now,
    })).toThrow();
  });
  it("keeps live workflow no-funds, no-Supabase and quota governed",()=>{
    const fs=require("node:fs");
    const workflow=fs.readFileSync(".github/workflows/gri-b2-historical-live-readback.yml","utf8");
    const source=fs.readFileSync("scripts/ops/verify-global-risk-b2-historical-readback.mjs","utf8");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: historical_gri_readback");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(workflow).not.toContain("secrets.SUPABASE");
    expect(workflow).not.toContain("schedule:");
    expect(source).toContain("readGlobalRiskB2Anchor");
    expect(source).toContain("verifyPinnedGlobalRiskBaseline");
    expect(source).not.toContain("b2.put(");
    expect(source).not.toContain("settleCoinbaseX402");
  });
});
