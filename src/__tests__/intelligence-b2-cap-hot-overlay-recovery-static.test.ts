import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publisher = readFileSync(
  "scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs",
  "utf8",
);
const runner = readFileSync(
  "scripts/ops/run-b2-public-intelligence-publisher.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/intelligence-scored-refresh.yml",
  "utf8",
);

describe("public Intelligence B2-cap hot-overlay recovery", () => {
  it("uses only the already-verified Intelligence edge as the cap-recovery baseline", () => {
    expect(publisher).toContain(
      'PUBLIC_INTELLIGENCE_EDGE_URL =\n  "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence"',
    );
    expect(publisher).toContain(
      'PUBLIC_INTELLIGENCE_EDGE_AUTHORITY = "backblaze-b2-intelligence-edge"',
    );
    expect(publisher).toContain(
      'response.headers.get("x-geomacro-authority")',
    );
    expect(publisher).toContain(
      'response.headers.get("x-geomacro-b2-sha256")',
    );
    expect(publisher).toContain(
      "PUBLIC_INTELLIGENCE_VERIFIED_EDGE_B2_SHA_INVALID",
    );
    expect(publisher).toContain(
      "PUBLIC_INTELLIGENCE_VERIFIED_EDGE_BASELINE_INVALID",
    );
    expect(publisher).toContain(
      "validVerifiedEdgeBaselineRows(payload?.rows)",
    );
  });

  it("never marks a new B2 snapshot verified when the download/transaction cap blocks readback", () => {
    expect(publisher).toContain(
      'schema: "geomacro.public-intelligence-overlay-recovery.v1"',
    );
    expect(publisher).toContain("baseline_b2_readback_verified: true");
    expect(publisher).toContain("current_b2_snapshot_promoted: false");
    expect(publisher).toContain('authority_read: "verified-intelligence-edge"');
    expect(publisher).toContain('authority_serve: "cloudflare-d1-hot-overlay"');
    expect(publisher).toContain('execution_authorized: false');
    expect(publisher).toContain(
      "await publishHotOverlay(current, baseline.generatedAt, baseline.b2Sha256)",
    );
  });

  it("checks the existing B2 proof before overwriting the canonical live object", () => {
    const preflight = publisher.indexOf("await b2.get(PROOF_KEY);");
    const livePut = publisher.indexOf("await b2.put(LIVE_KEY, packed);");
    expect(preflight).toBeGreaterThan(-1);
    expect(livePut).toBeGreaterThan(preflight);
  });

  it("handles cap exhaustion both before and after the live write without weakening other errors", () => {
    expect(publisher).toContain('return "B2_DOWNLOAD_CAP_EXCEEDED"');
    expect(publisher).toContain('return "B2_TRANSACTION_CAP_EXCEEDED"');
    expect(publisher.match(/publishB2CapOverlayRecovery\(current, error\)/g)?.length)
      .toBeGreaterThanOrEqual(3);
    expect(publisher).toContain("if (!reason) throw error");
  });

  it("parses multi-line publisher stdout so recovery proof is not lost behind overlay diagnostics", () => {
    expect(runner).toContain(".split(/\\r?\\n/u)");
    expect(runner).not.toContain(".split(/\\\\r?\\\\n/u)");
    expect(runner).toContain('"geomacro.public-intelligence-overlay-recovery.v1"');
    expect(runner).toContain(".at(-1)");
  });

  it("keeps normal full-B2 publication and recovery as distinct proof schemas", () => {
    expect(publisher).toContain(
      'schema: "geomacro.public-intelligence-direct-postgres-publish.v2"',
    );
    expect(publisher).toContain("b2_readback_verified: true");
    expect(runner).toContain(
      '"geomacro.public-intelligence-overlay-recovery.v1"',
    );
    expect(runner).toContain(
      '"verified_b2_baseline_plus_d1_hot_overlay"',
    );
    expect(runner).toContain(
      '"full_b2_readback_verified_publish"',
    );
  });

  it("accepts recovery in production only under strict baseline and safety invariants", () => {
    expect(workflow).toContain(
      "'geomacro.public-intelligence-overlay-recovery.v1'",
    );
    expect(workflow).toContain(
      "proof?.authority_read === 'verified-intelligence-edge'",
    );
    expect(workflow).toContain(
      "proof?.authority_serve === 'cloudflare-d1-hot-overlay'",
    );
    expect(workflow).toContain(
      "proof?.baseline_b2_readback_verified === true",
    );
    expect(workflow).toContain(
      "proof?.current_b2_snapshot_promoted === false",
    );
    expect(workflow).toContain(
      "proof?.raw_source_headlines_exposed === false",
    );
    expect(workflow).toContain(
      "proof?.provider_identity_exposed === false",
    );
    expect(workflow).toContain(
      "proof?.execution_authorized === false",
    );
    expect(workflow).toContain(
      "(!fullB2PublishValid && !capOverlayRecoveryValid)",
    );
  });
});
