import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {verifyPinnedGlobalRiskBaseline,classifyHistoricalGriReadbackFailure,classifyPinnedGlobalRiskAnchor} from "../../scripts/ops/verify-global-risk-b2-historical-readback.mjs";
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
  it("reports sanitized fixed failure classes without leaking B2 or source details",()=>{
    const make=(message:string)=>classifyHistoricalGriReadbackFailure(new Error(message));
    expect(make("GLOBAL_RISK_B2_ANCHOR_UNAVAILABLE_503"))
      .toBe("HISTORICAL_GRI_B2_D1_ANCHOR_HTTP_UNAVAILABLE");
    expect(make("GLOBAL_RISK_B2_ANCHOR_UNAVAILABLE_404"))
      .toBe("HISTORICAL_GRI_B2_D1_ANCHOR_HTTP_UNAVAILABLE");
    expect(make("HISTORICAL_GRI_B2_COMPRESSED_B2_READBACK_SHA_MISMATCH"))
      .toBe("HISTORICAL_GRI_B2_COMPRESSED_B2_READBACK_SHA_MISMATCH");
    expect(make("B2_REQUEST_BUDGET_EXHAUSTED"))
      .toBe("HISTORICAL_GRI_B2_SHARED_QUOTA_HELD");
    expect(make("B2_NATIVE_GET_NETWORK_FAILED"))
      .toBe("HISTORICAL_GRI_B2_TRANSPORT_OR_AUTH_UNAVAILABLE");
    expect(make("Access key secret test https://danger.invalid/private/foo"))
      .toBe("HISTORICAL_GRI_B2_UNKNOWN_FAIL_CLOSED");
    expect(make("GLOBAL_RISK_B2_ANCHOR_UNAVAILABLE_503 source secret"))
      .toBe("HISTORICAL_GRI_B2_UNKNOWN_FAIL_CLOSED");
    expect(classifyHistoricalGriReadbackFailure(null))
      .toBe("HISTORICAL_GRI_B2_UNKNOWN_FAIL_CLOSED");
  });
  it("triages a direct D1 B2 anchor without declaring actual readback",()=>{
    const result=classifyPinnedGlobalRiskAnchor({
      anchor:{...anchor,anchor_kind:"direct_verified_b2_snapshot"},now,
    });
    expect(result).toMatchObject({
      metadata_accepted:true,
      mutable_live_object_read_safe_to_attempt:true,
      historical_b2_readback_verified:false,
      current_gri_qualified:false,b2_operations:0,x402_charges:0,
    });
    expect(JSON.stringify(result)).not.toContain(anchor.b2_sha256);
  });
  it("refuses to spend Class-B reading mutable live key for independently proved prior baseline",()=>{
    const result=classifyPinnedGlobalRiskAnchor({
      anchor:{...anchor,anchor_kind:"prior_b2_baseline_of_independent_gri_proof"},now,
    });
    expect(result).toMatchObject({
      immutable_version_or_independent_original_pin_required:true,
      mutable_live_object_read_safe_to_attempt:false,
      historical_b2_readback_verified:false,b2_operations:0,
    });
    for (const altered of [
      {...anchor,anchor_kind:"UNKNOWN"},
      {...anchor,anchor_kind:"direct_verified_b2_snapshot",b2_sha256:"?" },
      {...anchor,anchor_kind:"direct_verified_b2_snapshot",generated_at:"2099-01-01T00:00:00Z"},
    ]) expect(()=>classifyPinnedGlobalRiskAnchor({anchor:altered,now})).toThrow();
  });

  it("keeps live workflow no-funds, no-Supabase and quota governed",()=>{
    const workflow=readFileSync(".github/workflows/gri-b2-historical-live-readback.yml","utf8");
    const source=readFileSync("scripts/ops/verify-global-risk-b2-historical-readback.mjs","utf8");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: historical_gri_readback");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(workflow).not.toContain("secrets.SUPABASE");
    expect(workflow).toContain("inputs.mode == 'governed_b2_readback'");
    expect(workflow).toContain("inputs.mode == 'metadata_only'");
    expect(workflow).toContain("node scripts/ops/verify-global-risk-b2-historical-readback.mjs --metadata-only");
    // Merging verifier fixes must not trigger another billable B2 GET.
    const job=workflow.slice(workflow.indexOf("  actual-governed-historical-b2-readback:"));
    expect(job).toContain("github.event_name == 'workflow_dispatch'");
    expect(job).not.toContain("github.event_name != 'pull_request'");
    expect(workflow).not.toContain("schedule:");
    expect(source).toContain("readGlobalRiskB2Anchor");
    expect(source).toContain("verifyPinnedGlobalRiskBaseline");
    expect(source).not.toContain("b2.put(");
    expect(source).not.toContain("settleCoinbaseX402");
  });
});
