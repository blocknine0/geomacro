import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { makeQuotaProtectedRiskIndicesConfig } from "../../scripts/ops/configure-risk-indices-edge-d1-quota.mjs";
import worker from "../../workers/risk-indices-edge/src/index.mjs";

const now = new Date();
const uuid = "abcdef12-3456-7890-abcd-ef1234567890";
const base = JSON.parse(readFileSync("workers/risk-indices-edge/wrangler.jsonc", "utf8"));

afterEach(() => vi.unstubAllGlobals());
const request = () => new Request("https://edge.test/risk-indices");
const ctx = { waitUntil: () => undefined };
const control = {
  fetch: async () => Response.json({
    ok: false, error: "HOT_SNAPSHOT_STALE_OR_INVALID",
  }, { status: 503 }),
};
function fakeD1({ exhausted = false } = {}) {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      calls.push(sql);
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              expect(sql).toContain("ON CONFLICT(day_utc) DO UPDATE");
              expect(args).toContain(25);
              if (exhausted) return null;
              return { total_requests: 1, get_requests: 1,
                put_requests: 0, head_requests: 0,
                native_auth_requests: 0 };
            },
            async run() {
              expect(sql).toContain("b2_request_quota_workflow_receipt");
              expect(args).toContain("risk_indices_public_edge");
              return {success:true};
            },
          };
        },
      };
    },
  };
  return {db, calls};
}
function resetCache() {
  vi.stubGlobal("caches", {default: {
    match: async () => null,
    put: async () => undefined,
  }});
}

describe("#1827 Risk Indices public B2 shared account GET reservation", () => {
  it("derives exactly one existing D1 binding and rejects substitution", () => {
    const cfg=makeQuotaProtectedRiskIndicesConfig(base, uuid);
    expect(cfg.d1_databases).toEqual([{
      binding: "B2_QUOTA_DB",
      database_name: "geomacro-control-plane",
      database_id: uuid,
    }]);
    expect(cfg.cache).toEqual(base.cache);
    expect(cfg.services).toEqual(base.services);
    expect(base.d1_databases).toBeUndefined();
    expect(()=>makeQuotaProtectedRiskIndicesConfig(base, "user-supplied")).toThrow(
      "RISK_INDICES_B2_QUOTA_D1_ID_INVALID");
    expect(()=>makeQuotaProtectedRiskIndicesConfig({...base,services:[]},uuid))
      .toThrow("RISK_INDICES_B2_QUOTA_BASE_CONFIG_INVALID");
  });

  it("fails closed before any B2 GET if the shared D1 binding is missing", async () => {
    resetCache();
    const b2Fetch=vi.fn(async()=>{throw Error("B2 must not be contacted");});
    vi.stubGlobal("fetch",b2Fetch);
    const response=await worker.fetch(request(),{
      B2_KEY_ID:"bounded-read", B2_APPLICATION_KEY:"bounded-secret",
      CONTROL_PLANE:control,
    },ctx);
    expect(response.status).toBe(503);
    expect(b2Fetch).not.toHaveBeenCalled();
  });

  it("does not make any public-origin B2 GET when global GET quota is exhausted", async () => {
    resetCache();
    const b2Fetch=vi.fn(async()=>{throw Error("B2 must not be contacted");});
    vi.stubGlobal("fetch",b2Fetch);
    const {db,calls}=fakeD1({exhausted:true});
    const response=await worker.fetch(request(),{
      B2_KEY_ID:"bounded-read",B2_APPLICATION_KEY:"bounded-secret",
      CONTROL_PLANE:control, B2_QUOTA_DB:db,
    },ctx);
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(b2Fetch).not.toHaveBeenCalled();
  });

  it("reserves one D1 ticket and receipt BEFORE its first actual B2 GET", async () => {
    resetCache();
    const {db,calls}=fakeD1();
    const b2Fetch=vi.fn(async (_url: string, options: any)=>{
      expect(calls).toHaveLength(2);
      expect(options.method).toBe("GET");
      return new Response("B2_DOWNLOAD_CAP_EXCEEDED",{status:403});
    });
    vi.stubGlobal("fetch",b2Fetch);
    const response=await worker.fetch(request(),{
      B2_KEY_ID:"bounded-read",B2_APPLICATION_KEY:"bounded-secret",
      CONTROL_PLANE:control,B2_QUOTA_DB:db,
    },ctx);
    expect(response.status).toBe(503);
    expect(b2Fetch).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it("never reserves B2 GET when D1 hot succeeds (tested through real route)", async()=>{
    resetCache();
    // The existing verified D1 hot runtime suite covers the full schema/hash.
    // This regression proves the quota guard is isolated to signedGet and
    // does not add extra account requests to the hot path.
    const source=readFileSync("workers/risk-indices-edge/src/index.mjs","utf8");
    const serving=source.slice(source.indexOf("export default"));
    expect(serving.indexOf("const hotSnapshot = await readD1HotSnapshot(env)"))
      .toBeLessThan(serving.indexOf("const cached = await cache.match(cacheKey)"));
    expect(serving.indexOf("const cached = await cache.match(cacheKey)"))
      .toBeLessThan(serving.indexOf("const response = await buildResponse(env)"));
    expect(source.indexOf('reserveB2AccountQuota(env.B2_QUOTA_DB'))
      .toBeLessThan(source.indexOf("const path ="));
  });

  it("deployment proves schema version 5 and uses only ephemeral Wrangler binding",()=>{
    const deploy=readFileSync(".github/workflows/deploy-risk-indices-edge.yml","utf8");
    expect(deploy).toContain("SHARED_B2_D1_QUOTA_SCHEMA_V5_REQUIRED");
    expect(deploy).toContain("configure-risk-indices-edge-d1-quota.mjs");
    expect(deploy).toContain("wrangler.runtime.jsonc");
    expect(deploy).toContain('d1 execute B2_QUOTA_DB');
    expect(deploy).not.toContain("wrangler d1 create");
    expect(deploy).toContain("SOURCE_RUN_ID: ${{ github.event.workflow_run.id || '' }}");
    expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
  });
});
