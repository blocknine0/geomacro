import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { makeQuotaProtectedGlobalRiskConfig } from "../../scripts/ops/configure-global-risk-edge-d1-quota.mjs";
import worker from "../../workers/global-risk-edge/src/index.mjs";

const DB_ID="abcdef12-3456-7890-abcd-ef1234567890";
const config=JSON.parse(readFileSync("workers/global-risk-edge/wrangler.jsonc","utf8"));
const ctx={waitUntil:()=>undefined};
const request=()=>new Request("https://edge.test/global-risk");
const noHot={fetch:async()=>Response.json({ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID"},{status:503})};

afterEach(()=>vi.unstubAllGlobals());
function noCache() {
  vi.stubGlobal("caches",{default:{
    match:async()=>null,
    put:async()=>undefined,
  }});
}
function dbFixture({exhausted=false,failReceipt=false}={}) {
  const calls:string[]=[];
  const db={
    prepare(sql:string) {
      calls.push(sql);
      return {
        bind(...params:unknown[]) {
          return {
            async first() {
              expect(sql).toContain("ON CONFLICT(day_utc) DO UPDATE");
              expect(params).toContain(25);
              if(exhausted)return null;
              return {
                total_requests:1,get_requests:1,put_requests:0,
                head_requests:0,native_auth_requests:0,
              };
            },
            async run() {
              expect(sql).toContain("b2_request_quota_workflow_receipt");
              expect(params).toContain("global_risk_public_edge");
              if(failReceipt)throw new Error("D1_WORKFLOW_RECEIPT_WRITE_FAILED");
              return {success:true};
            },
          };
        },
      };
    },
  };
  return {db,calls};
}
const env=(db?:unknown)=>({
  B2_KEY_ID:"read-only-access",
  B2_APPLICATION_KEY:"read-only-secret",
  CONTROL_PLANE:noHot,
  ...(db?{B2_QUOTA_DB:db}:{}),
});
describe("#1827 account-wide public Global Risk B2 quota guard",()=>{
  it("derives only the authorized preexisting D1 production binding",()=>{
    const bound=makeQuotaProtectedGlobalRiskConfig(config,DB_ID);
    expect(bound.d1_databases).toEqual([{
      binding:"B2_QUOTA_DB",database_name:"geomacro-control-plane",
      database_id:DB_ID,
    }]);
    expect(bound.cache).toEqual(config.cache);
    expect(bound.services).toEqual(config.services);
    expect(config.d1_databases).toBeUndefined();
    expect(()=>makeQuotaProtectedGlobalRiskConfig(config,"arbitrary"))
      .toThrow("GLOBAL_RISK_QUOTA_D1_ID_INVALID");
    expect(()=>makeQuotaProtectedGlobalRiskConfig({...config,services:[]},DB_ID))
      .toThrow("GLOBAL_RISK_QUOTA_BASE_CONFIG_INVALID");
    expect(()=>makeQuotaProtectedGlobalRiskConfig({...config,d1_databases:[]},DB_ID))
      .toThrow("GLOBAL_RISK_QUOTA_BASE_CONFIG_INVALID");
  });

  it("does not make even a single B2 GET if production quota D1 is absent",async()=>{
    noCache();
    const b2=vi.fn(async()=>{throw Error("UNEXPECTED_B2_NETWORK");});
    vi.stubGlobal("fetch",b2);
    const response=await worker.fetch(request(),env(),ctx);
    expect(response.status).toBe(503);
    expect(b2).not.toHaveBeenCalled();
  });

  it("rejects exhausted total/global GET budget without contacting Backblaze",async()=>{
    noCache();
    const b2=vi.fn(async()=>{throw Error("UNEXPECTED_B2_NETWORK");});
    vi.stubGlobal("fetch",b2);
    const {db,calls}=dbFixture({exhausted:true});
    const response=await worker.fetch(request(),env(db),ctx);
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(b2).not.toHaveBeenCalled();
  });

  it("rejects failed D1 workflow receipt before outbound Backblaze GET",async()=>{
    noCache();
    const b2=vi.fn(async()=>{throw Error("UNEXPECTED_B2_NETWORK");});
    vi.stubGlobal("fetch",b2);
    const {db,calls}=dbFixture({failReceipt:true});
    const response=await worker.fetch(request(),env(db),ctx);
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(2);
    expect(b2).not.toHaveBeenCalled();
  });

  it("reserves one global GET ticket and durable workflow receipt before B2 GET",async()=>{
    noCache();
    const {db,calls}=dbFixture();
    const b2=vi.fn(async(_url:string,options:any)=>{
      expect(calls).toHaveLength(2);
      expect(options.method).toBe("GET");
      return new Response("B2_CAP_EXCEEDED",{status:403});
    });
    vi.stubGlobal("fetch",b2);
    const response=await worker.fetch(request(),env(db),ctx);
    expect(response.status).toBe(503);
    expect(b2).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it("D1 hot and existing verified Workers cache bypass B2 quota and remain unchanged",()=>{
    const code=readFileSync("workers/global-risk-edge/src/index.mjs","utf8");
    const start=code.slice(code.indexOf("export default"));
    expect(start.indexOf("const hotSnapshot = await readD1HotSnapshot(env)"))
      .toBeLessThan(start.indexOf("const cached = await cache.match(cacheKey)"));
    expect(start.indexOf("const cached = await cache.match(cacheKey)"))
      .toBeLessThan(start.indexOf("const response = await buildResponse(env)"));
    expect(code.indexOf("reserveB2AccountQuota(env.B2_QUOTA_DB"))
      .toBeLessThan(code.indexOf("const path ="));
    expect(code).toContain("const proofBytes = await signedGet(PROOF_KEY, env)");
    expect(code).toContain("proof?.full_b2_readback_verified !== true");
    expect(code).toContain("Date.now() - sourceAsOf > 90 * 60 * 1000");
  });

  it("production deployment is gated to new independent GRI proof and validates shared D1 schema",()=>{
    const flow=readFileSync(".github/workflows/deploy-global-risk-edge.yml","utf8");
    expect(flow).not.toContain('cron: "13 */6 * * *"');
    expect(flow).not.toContain("\n  schedule:");
    expect(flow).not.toContain("\n  push:");
    expect(flow).toContain('workflows: ["GRI Realtime Direct Postgres"]');
    expect(flow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(flow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(flow).toContain("github.event.workflow_run.head_repository.full_name == 'blocknine0/geomacro'");
    expect(flow).toContain("SOURCE_RUN_ID: ${{ github.event.workflow_run.id || '' }}");
    expect(flow).toContain("GLOBAL_RISK_SHARED_B2_D1_SCHEMA_V5_REQUIRED");
    expect(flow).toContain("configure-global-risk-edge-d1-quota.mjs");
    expect(flow).toContain("wrangler.runtime.jsonc");
    expect(flow).toContain("d1 execute B2_QUOTA_DB");
    expect(flow).not.toContain("wrangler d1 create");
    expect(flow).toContain("github.event_name == 'workflow_dispatch'");
  });
});
