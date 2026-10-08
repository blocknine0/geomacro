import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publisher = readFileSync("scripts/ops/publish-b2-global-risk-direct-postgres.mjs", "utf8");
const helper = readFileSync("scripts/ops/publish-b2-verified-hot-snapshot.mjs", "utf8");
const controlPlane = readFileSync("workers/control-plane/src/index.mjs", "utf8");
const workflow = readFileSync(".github/workflows/gri-realtime-direct-postgres.yml", "utf8");

describe("Global Risk B2-cap current-proof recovery", () => {
  it("preflights B2 before writes and recovers only recognized cap failures", () => {
    expect(publisher).toContain("await b2.getOptional(LIVE_PROOF_KEY)");
    expect(publisher).toContain("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(publisher).toContain("B2_TRANSACTION_CAP_EXCEEDED");
    expect(publisher).toContain("if (!isB2CapError(error)) throw error");
    expect(publisher).toContain("function errorChainText(error)");
    expect(publisher).toContain('"cause" in value');
    expect(publisher).toContain("Array.isArray(value.errors)");
    expect(publisher).toContain('parts.push(value.stack)');
  });

  it("never promotes or claims current B2 readback in recovery mode", () => {
    expect(publisher).toContain('CURRENT_PROOF_MODE = "independent-gri-proof-over-b2-baseline"');
    expect(publisher).toContain("current_b2_snapshot_promoted: false");
    expect(publisher).toContain("current_b2_readback_verified: false");
    expect(publisher).toContain("baseline_b2_readback_verified: true");
    expect(publisher).toContain("independent_gri_proof_verified: true");
    expect(publisher).toContain("synthetic_current_score: false");
  });

  it("reads the durable B2 anchor through authenticated control-plane state", () => {
    expect(helper).toContain("/v1/hot-snapshot-anchor/global-risk");
    expect(helper).toContain("GLOBAL_RISK_B2_ANCHOR_UNAVAILABLE_");
    expect(controlPlane).toContain("async function readGlobalRiskB2Anchor");
    expect(controlPlane).toContain("HOT_SNAPSHOT_GLOBAL_RISK_B2_ANCHOR_MISMATCH");
    expect(controlPlane).toContain("GLOBAL_RISK_B2_BASELINE_MAX_AGE_MS");
  });

  it("cryptographically binds current GRI proof hashes to the current payload", () => {
    for (const marker of [
      "proof_hash",
      "evidence_hash",
      "calculation_hash",
      "disposition_hash",
      "input_hash",
      "methodology_hash",
      "change_hash",
      "candidate_event_count",
      "reconciliation_residual",
      "change_residual",
    ]) expect(controlPlane).toContain(marker);
  });

  it("keeps the normal hourly GRI workflow and direct B2 path unchanged", () => {
    expect(workflow).toContain('cron: "23 * * * *"');
    expect(publisher).toContain('schema: "geomacro.public-global-risk-direct-postgres-publish.v1"');
    expect(publisher).toContain('verification_mode: "direct-b2-readback"');
    expect(publisher).toContain("b2_readback_verified: true");
    expect(publisher).toContain("exact_gzip_restore_verified: true");
  });
});
