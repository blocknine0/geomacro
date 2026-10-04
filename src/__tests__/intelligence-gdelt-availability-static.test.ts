import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrapper = readFileSync("scripts/ops/run-b2-public-intelligence-publisher.mjs", "utf8");
const publisher = readFileSync("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs", "utf8");
const workflow = readFileSync(".github/workflows/intelligence-scored-refresh.yml", "utf8");

describe("Intelligence GDELT availability contract", () => {
  it("retries only the documented rolling-manifest availability race within a hard bound", () => {
    expect(wrapper).toContain('RETRYABLE_AVAILABILITY_ERROR = "CURRENT_GDELT_EXPORT_UNAVAILABLE"');
    expect(wrapper).toContain("DEFAULT_MAX_WAIT_MS = 8 * 60 * 1000");
    expect(wrapper).toContain("DEFAULT_POLL_MS = 10_000");
    expect(wrapper).toContain("if (!combined.includes(RETRYABLE_AVAILABILITY_ERROR))");
    expect(wrapper).toContain("CURRENT_GDELT_AVAILABILITY_WAIT_EXHAUSTED");
    expect(wrapper).not.toContain("--retry-all-errors");
  });

  it("does not weaken publisher host, hash, schema, freshness or scoring guards", () => {
    expect(publisher).toContain('listed.hostname !== "data.gdeltproject.org"');
    expect(publisher).toContain("CURRENT_GDELT_EXPORT_MD5_MISMATCH");
    expect(publisher).toContain("GDELT_EXPECTED_COLUMNS = 61");
    expect(publisher).toContain("CURRENT_GDELT_BATCH_STALE");
    expect(publisher).toContain('public_status: "live_observed"');
    expect(publisher).toContain("row?.severity !== null");
    expect(publisher).toContain("B2_PUBLIC_INTELLIGENCE_HASH_INVALID");
    expect(publisher).toContain("B2_PUBLIC_INTELLIGENCE_PROOF_READBACK_INVALID");
  });

  it("makes the bounded runner the canonical production publish entrypoint", () => {
    expect(workflow).toContain('scripts/ops/run-b2-public-intelligence-publisher.mjs');
    expect(workflow).toContain('node scripts/ops/run-b2-public-intelligence-publisher.mjs | tee /tmp/intelligence-publish.log');
    expect(workflow).not.toContain('run: bun scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs');
  });

  it("fails closed until the production API serves the exact scored-plus-current publish", () => {
    expect(workflow).toContain("PUBLIC_INTELLIGENCE_PUBLISH_PROOF_INVALID");
    expect(workflow).toContain("proof.b2_readback_verified !== true");
    expect(workflow).toContain("for attempt in $(seq 1 24)");
    expect(workflow).toContain("freshness_proof=${nonce}");
    expect(workflow).toContain("-H 'Cache-Control: no-cache'");
    expect(workflow).toContain("body?.mode === 'verified_b2_plus_live_observed'");
    expect(workflow).toContain("live < 1");
    expect(workflow).toContain("responseNewest < expectedBatch");
    expect(workflow).toContain("newestLive < expectedBatch");
    expect(workflow).toContain("Production Intelligence API did not converge");
    expect(workflow).not.toContain("the B2 publisher remains authoritative and independently readback-verified");
    expect(workflow).not.toContain("has not caught up to the latest scored-plus-current contract yet");
  });
});
