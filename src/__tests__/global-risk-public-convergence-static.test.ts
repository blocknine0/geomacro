import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/b2-global-risk-maintenance.yml", "utf8");
const verifier = readFileSync("scripts/ops/verify-global-risk-public-convergence.mjs", "utf8");
const reader = readFileSync("src/lib/b2-live.server.ts", "utf8");
const api = readFileSync("server/api/public/global-risk.get.ts", "utf8");

describe("#1414 exact Global Risk B2-to-public convergence", () => {
  it("keeps acceptance correlated to the exact verified B2 snapshot and canonical edge authority", () => {
    expect(workflow).toContain("b2_readback_verified");
    expect(workflow).toContain("snapshot_as_of=$snapshot_as_of");
    expect(workflow).toContain("GEOMACRO_EXPECTED_GLOBAL_RISK_SNAPSHOT_AS_OF");
    expect(verifier).toContain("servedMs >= expectedMs");
    expect(verifier).toContain('EXPECTED_AUTHORITY = "backblaze-b2-verified-edge"');
    expect(api).toContain('authority: "backblaze-b2-verified-edge"');
    expect(verifier).toContain('data?.verificationStatus === "verified"');
    expect(verifier).toContain("body?.meta?.authority === EXPECTED_AUTHORITY");
  });

  it("waits beyond the bounded in-process B2 cache without weakening freshness", () => {
    expect(reader).toContain("CACHE_TTL_MS = 120_000");
    expect(verifier).toContain("MAX_ATTEMPTS = 18");
    expect(verifier).toContain("POLL_MS = 10_000");
    expect(verifier).toContain("GLOBAL_RISK_PUBLIC_CONVERGENCE_FAILED");
  });

  it("keeps convergence diagnostics metadata-only", () => {
    expect(verifier).toContain("raw_history_serialized: false");
    expect(verifier).not.toContain("series7:");
    expect(verifier).not.toContain("series30:");
    expect(verifier).not.toContain("rows:");
  });
});
