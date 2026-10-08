import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("workers/risk-indices-edge/src/index.mjs", "utf8");
const wrangler = readFileSync("workers/risk-indices-edge/wrangler.jsonc", "utf8");
const deploy = readFileSync(".github/workflows/deploy-risk-indices-edge.yml", "utf8");
const refresh = readFileSync(".github/workflows/risk-indices-realtime-direct-postgres.yml", "utf8");
const publisher = readFileSync("scripts/ops/publish-b2-risk-indices-direct-postgres.mjs", "utf8");
const serverReader = readFileSync("src/lib/risk-indices-edge.server.ts", "utf8");
const api = readFileSync("server/api/public/risk-indices.get.ts", "utf8");
const hook = readFileSync("src/lib/use-risk-indices.ts", "utf8");

describe("independent verified Risk Indices edge", () => {
  it("owns a dedicated B2 live/proof namespace that legacy snapshot maintenance cannot overwrite", () => {
    expect(publisher).toContain('LIVE_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz"');
    expect(publisher).toContain('LIVE_PROOF_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest-proof.json"');
    expect(worker).toContain('LIVE_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz"');
    expect(worker).toContain('PROOF_KEY = "geomacro-evidence/v1/live/risk-indices-independent/latest-proof.json"');
    expect(worker).toContain("async function readD1HotSnapshot()");
    expect(worker).toContain("await sha256(payloadJson) !== snapshot.payload_sha256");
    expect(worker).toContain("Date.now() - sourceAsOf > 90 * 60 * 1000");
    expect(worker).toContain('"x-geomacro-serving-store": "cloudflare-d1"');
    expect(worker).toContain('cached.headers.get("x-geomacro-serving-store") === "cloudflare-d1"');
    expect(worker).toContain("ctx.waitUntil(cache.put(cacheKey, hotSnapshot.clone()))");
    expect(worker).toContain("const hotSnapshot = await readD1HotSnapshot()");
    expect(publisher).not.toContain('LIVE_KEY = "geomacro-evidence/v1/live/global-risk/latest.json.gz"');
  });

  it("binds each live package to readback-verified proof and immutable per-snapshot history", () => {
    expect(publisher).toContain("geomacro.public-risk-indices-history.v1");
    expect(publisher).toContain("B2_RISK_INDICES_HISTORY_IMMUTABILITY_VIOLATION");
    expect(publisher).toContain("full_b2_readback_verified: true");
    expect(publisher).toContain("exact_gzip_restore_verified: true");
    expect(worker).toContain("proof?.compressed_sha256 !== liveDigest");
    expect(worker).toContain("proof?.full_b2_readback_verified !== true");
    expect(worker).toContain("proof?.exact_gzip_restore_verified !== true");
  });

  it("exposes one read-only Risk Indices route from its own Cloudflare worker", () => {
    expect(wrangler).toContain('"name": "geomacro-risk-indices"');
    expect(worker).toContain('url.pathname !== "/risk-indices"');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('"x-geomacro-authority": "backblaze-b2-risk-indices-edge"');
    expect(worker).not.toContain('url.pathname !== "/global-risk"');
    expect(worker).not.toContain("request.json()");
  });

  it("keeps publisher quota-free and separate from Global Risk and Intelligence workflows", () => {
    expect(refresh).toContain("group: geomacro-risk-indices-realtime");
    expect(refresh).toContain('cron: "38 * * * *"');
    expect(refresh).toContain("publish-b2-risk-indices-direct-postgres.mjs");
    expect(refresh).not.toContain("scripts/ingest-news.js");
    expect(refresh).not.toContain("GUARDIAN_QUERY_BUDGET_PER_CATEGORY");
    expect(refresh).not.toContain("GROQ_API_KEY");
    expect(refresh).not.toContain("publish-b2-global-risk-direct-postgres.mjs");
    expect(refresh).not.toContain("publish-b2-public-intelligence-direct-postgres.mjs");
  });

  it("deploys only after materializing a successful B2-readback-verified continuity artifact", () => {
    expect(deploy).toContain("prepare-edge-continuity.sh");
    expect(deploy).toContain("risk-indices-realtime-direct-postgres.yml");
    expect(deploy).toContain("geomacro.public-risk-indices-direct-postgres-publish.v1");
    expect(deploy).not.toContain("Bootstrap isolated verified Risk Indices package");
    expect(deploy).not.toContain("publish-b2-risk-indices-direct-postgres.mjs | tee");
    expect(deploy).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(deploy).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(deploy).toContain("geomacro-risk-indices.daspallab202391.workers.dev");
    expect(deploy).toContain("backblaze-b2-risk-indices-edge");
    expect(deploy).toContain("EDGE_7D_HISTORY_INVALID");
    expect(deploy).toContain("Unexpected write surface");
    expect(worker).toContain('import continuity from "./continuity.mjs"');
    expect(worker).toContain("RISK_INDICES_CONTINUITY_HASH_INVALID");
  });

  it("keeps browser and Lovable compatibility reads on Risk Indices authority only", () => {
    expect(serverReader).toContain("geomacro-risk-indices.daspallab202391.workers.dev/risk-indices");
    expect(serverReader).toContain("backblaze-b2-risk-indices-edge");
    expect(serverReader).not.toContain("geomacro-global-risk");
    expect(api).toContain("readRiskIndicesEdge");
    expect(api).not.toContain("readGlobalRiskEdge");
    expect(hook).toContain("RISK_INDICES_EDGE_URL");
    expect(hook).toContain('{ kind: "edge", url: RISK_INDICES_EDGE_URL }');
    expect(hook).toContain('{ kind: "app", url: RISK_INDICES_APP_URL }');
    expect(hook.indexOf('{ kind: "edge", url: RISK_INDICES_EDGE_URL }')).toBeLessThan(
      hook.indexOf('{ kind: "app", url: RISK_INDICES_APP_URL }'),
    );
    expect(hook).not.toContain("GLOBAL_RISK_EDGE_URL");
  });
});
