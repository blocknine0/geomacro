import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("verified public edge hot-cache contract", () => {
  it("adds a proof-bound Intelligence edge and keeps B2 as durable authority", () => {
    const worker = read("workers/intelligence-edge/src/index.mjs");
    const wrangler = read("workers/intelligence-edge/wrangler.jsonc");
    const deploy = read(".github/workflows/deploy-intelligence-edge.yml");
    const b2 = read("src/lib/b2-live.server.ts");

    expect(wrangler).toContain('"name": "geomacro-intelligence"');
    expect(wrangler).toContain('"enabled": true');
    expect(wrangler).toContain('"cross_version_cache": true');
    expect(worker).toContain('LIVE_KEY = "geomacro-evidence/v1/live/public-intelligence/latest.json.gz"');
    expect(worker).toContain('PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json"');
    expect(worker).toContain('proof?.full_b2_readback_verified !== true');
    expect(worker).toContain('proof?.exact_gzip_restore_verified !== true');
    expect(worker).toContain('proof?.raw_source_headlines_exposed !== false');
    expect(worker).toContain('proof?.provider_identity_exposed !== false');
    expect(worker).toContain('proof?.synthetic_score !== false');
    expect(worker).toContain('"x-geomacro-authority": "backblaze-b2-intelligence-edge"');
    expect(worker).toContain("stale-while-revalidate=3600");
    expect(worker).toContain("stale-if-error=86400");
    expect(deploy).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(deploy).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(deploy).toContain("geomacro-intelligence.daspallab202391.workers.dev");
    expect(b2).toContain("await readPublicIntelligenceEdge()");
    expect(b2.indexOf("await readPublicIntelligenceEdge()")).toBeLessThan(
      b2.indexOf("const payload = await readJsonGzip<{"),
    );
  });

  it("uses Workers Cache for all public verified B2 edges without s-maxage disabling stale continuity", () => {
    for (const base of ["global-risk-edge", "risk-indices-edge", "intelligence-edge"]) {
      const wrangler = read(`workers/${base}/wrangler.jsonc`);
      const worker = read(`workers/${base}/src/index.mjs`);
      expect(wrangler).toContain('"enabled": true');
      expect(wrangler).toContain('"cross_version_cache": true');
      expect(worker).toContain("stale-while-revalidate=3600");
      expect(worker).toContain("stale-if-error=86400");
      expect(worker).not.toContain("s-maxage=");
    }
  });
});
