import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("workers/global-risk-edge/src/index.mjs", "utf8");
const wrangler = readFileSync("workers/global-risk-edge/wrangler.jsonc", "utf8");
const workflow = readFileSync(".github/workflows/deploy-global-risk-edge.yml", "utf8");
const serverReader = readFileSync("src/lib/global-risk-edge.server.ts", "utf8");
const publicApi = readFileSync("server/api/public/global-risk.get.ts", "utf8");
const publicIndicesApi = readFileSync("server/api/public/risk-indices.get.ts", "utf8");

describe("verified Global Risk edge serving boundary", () => {
  it("exposes exactly one read-only public risk route from private B2", () => {
    expect(wrangler).toContain('"name": "geomacro-global-risk"');
    expect(worker).toContain('url.pathname !== "/global-risk"');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('B2_BUCKET = "geomacro-private-archive"');
    expect(worker).toContain('LIVE_KEY = "geomacro-evidence/v1/live/global-risk/latest.json.gz"');
    expect(worker).toContain('PROOF_KEY = "geomacro-evidence/v1/live/global-risk/latest-proof.json"');
    expect(worker).not.toContain("request.json()");
    expect(worker).not.toContain("PUT\"");
    expect(worker).not.toContain("DELETE\"");
  });

  it("cryptographically binds the live gzip to its verified proof before serving", () => {
    expect(worker).toContain('proof?.compressed_sha256 !== liveDigest');
    expect(worker).toContain('proof?.full_b2_readback_verified !== true');
    expect(worker).toContain('proof?.exact_gzip_restore_verified !== true');
    expect(worker).toContain('data?.snapshotId !== proof?.snapshot_id');
    expect(worker).toContain('data?.snapshotAsOf !== proof?.snapshot_as_of');
    expect(worker).toContain('data?.verificationStatus !== "verified"');
    expect(worker).toContain('"x-geomacro-authority": "backblaze-b2-verified-edge"');
  });

  it("requires all three real domain histories and does not synthesize missing data", () => {
    expect(worker).toContain('["geopolitics", "macro", "rare_earth"]');
    expect(worker).toContain('domain.series["7D"].buckets.length >= 2');
    expect(worker).not.toContain("synthetic");
    expect(worker).not.toContain("score: 0");
  });

  it("deploys with existing production Cloudflare and B2 secrets and runs live acceptance", () => {
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).toContain("secrets.B2_KEY_ID");
    expect(workflow).toContain("secrets.B2_APPLICATION_KEY");
    expect(workflow).toContain('wrangler@${WRANGLER_VERSION}');
    expect(workflow).toContain("https://geomacro-global-risk.daspallab202391.workers.dev");
    expect(workflow).toContain("EDGE_DOMAIN_HISTORY_INVALID");
  });

  it("keeps Lovable API routes as pure compatibility transports without private B2 runtime imports", () => {
    expect(serverReader).toContain("https://geomacro-global-risk.daspallab202391.workers.dev/global-risk");
    expect(serverReader).toContain('response.headers.get("x-geomacro-authority") !== "backblaze-b2-verified-edge"');
    expect(serverReader).toContain("validateGlobalRiskContinuity(payload.data).ok");

    expect(publicApi).toContain("await readGlobalRiskEdge()");
    expect(publicApi).toContain('authority: "backblaze-b2-verified-edge"');
    expect(publicApi).not.toContain("readB2PublicRisk");
    expect(publicApi).not.toContain("b2-live.server");

    expect(publicIndicesApi).toContain("await readGlobalRiskEdge()");
    expect(publicIndicesApi).toContain("riskIndicesFromGlobalRisk(risk)");
    expect(publicIndicesApi).toContain('authority: "backblaze-b2-verified-edge"');
    expect(publicIndicesApi).not.toContain("readB2PublicRisk");
    expect(publicIndicesApi).not.toContain("b2-live.server");
  });
});
