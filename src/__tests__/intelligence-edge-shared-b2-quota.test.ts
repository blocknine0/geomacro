import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../workers/intelligence-edge/src/index.mjs";
import { makeQuotaProtectedIntelligenceConfig } from "../../scripts/ops/configure-intelligence-edge-d1-quota.mjs";

const DB_ID="abcdef12-3456-7890-abcd-ef1234567890";
const base=JSON.parse(readFileSync("workers/intelligence-edge/wrangler.jsonc","utf8"));
const request=()=>new Request("https://edge.test/intelligence");
const ctx={waitUntil:()=>undefined};
const control={fetch:async()=>Response.json({
  ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID",
},{status:503})};

afterEach(()=>vi.unstubAllGlobals());

function coldCache(){
  vi.stubGlobal("caches",{default:{
    match:async()=>null,
    put:async()=>undefined,
  }});
}
function d1({exhausted=false,failReceipt=false}={}){
  const operations:{sql:string,args:unknown[]}[]=[];
  const db={
    prepare(sql:string) {
      return {
        bind(...args:unknown[]) {
          return {
            async first() {
              operations.push({sql,args});
              expect(sql).toContain("ON CONFLICT(day_utc) DO UPDATE");
              expect(args).toContain(25);
              return exhausted?null:{
                total_requests:1,get_requests:1,put_requests:0,
                head_requests:0,native_auth_requests:0,
              };
            },
            async run() {
              operations.push({sql,args});
              expect(sql).toContain("b2_request_quota_workflow_receipt");
              expect(args).toContain("intelligence_public_edge");
              if(failReceipt)throw Error("D1_LEDGER_RECEIPT_UNAVAILABLE");
              return {success:true};
            },
          };
        },
      };
    },
  };
  return {db,operations};
}
const env=(db?:unknown)=>({
  B2_KEY_ID:"read-only-access",B2_APPLICATION_KEY:"read-only-secret",
  CONTROL_PLANE:control,...(db?{B2_QUOTA_DB:db}:{}),
});

describe("#1827 account-wide Intelligence edge Backblaze GET guard",()=>{
  it("only binds existing D1 quota DB, never creates arbitrary tables or resources",()=>{
    const bound=makeQuotaProtectedIntelligenceConfig(base,DB_ID);
    expect(bound.d1_databases).toEqual([{
      binding:"B2_QUOTA_DB",
      database_name:"geomacro-control-plane",
      database_id:DB_ID,
    }]);
    expect(bound.services).toEqual(base.services);
    expect(bound.cache).toEqual(base.cache);
    expect(base.d1_databases).toBeUndefined();
    expect(()=>makeQuotaProtectedIntelligenceConfig(base,"injected"))
      .toThrow("INTELLIGENCE_QUOTA_D1_ID_INVALID");
    expect(()=>makeQuotaProtectedIntelligenceConfig({...base,services:[]},DB_ID))
      .toThrow("INTELLIGENCE_QUOTA_BASE_CONFIG_INVALID");
    expect(()=>makeQuotaProtectedIntelligenceConfig({...base,d1_databases:[]},DB_ID))
      .toThrow("INTELLIGENCE_QUOTA_BASE_CONFIG_INVALID");
  });

  it("fails closed on cold-cache B2 origin when D1 binding missing",async()=>{
    coldCache();
    const b2=vi.fn(async()=>{throw Error("UNEXPECTED_B2_NETWORK");});
    vi.stubGlobal("fetch",b2);
    const response=await worker.fetch(request(),env(),ctx);
    expect(response.status).toBe(503);
    expect(b2).not.toHaveBeenCalled();
  });

  it("global 25-GET exhausted blocks both parallel proof/object B2 requests",async()=>{
    coldCache();
    const b2=vi.fn(async()=>{throw Error("UNEXPECTED_B2_NETWORK");});
    vi.stubGlobal("fetch",b2);
    const {db,operations}=d1({exhausted:true});
    const response=await worker.fetch(request(),env(db),ctx);
    expect(response.status).toBe(503);
    expect(b2).not.toHaveBeenCalled();
    expect(operations).toHaveLength(2);
    expect(operations.every(x=>x.sql.includes("ON CONFLICT(day_utc) DO UPDATE")))
      .toBe(true);
  });

  it("never contacts B2 if D1 per-workflow diagnostic receipt write fails",async()=>{
    coldCache();
    const b2=vi.fn(async()=>{throw Error("UNEXPECTED_B2_NETWORK");});
    vi.stubGlobal("fetch",b2);
    const {db,operations}=d1({failReceipt:true});
    const response=await worker.fetch(request(),env(db),ctx);
    expect(response.status).toBe(503);
    expect(b2).not.toHaveBeenCalled();
    expect(operations.some(x=>x.sql.includes("b2_request_quota_workflow_receipt"))).toBe(true);
  });

  it("each B2 origin GET has its OWN shared global quota and receipt before fetch",async()=>{
    coldCache();
    const {db,operations}=d1();
    let requests=0;
    const b2=vi.fn(async(_url:string,options:any)=>{
      requests++;
      expect(options.method).toBe("GET");
      const receipts=operations.filter(x=>x.sql.includes("b2_request_quota_workflow_receipt"));
      expect(receipts.length).toBeGreaterThanOrEqual(requests);
      return new Response("B2_DOWNLOAD_CAP_EXCEEDED",{status:403});
    });
    vi.stubGlobal("fetch",b2);
    const response=await worker.fetch(request(),env(db),ctx);
    expect(response.status).toBe(503);
    expect(b2).toHaveBeenCalledTimes(2);
    expect(operations).toHaveLength(4);
    expect(operations.filter(x=>x.sql.includes("b2_request_quota_workflow_receipt")))
      .toHaveLength(2);
  });

  it("D1 hot/verified POP projection remains before private B2 origin in existing serving code",()=>{
    const code=readFileSync("workers/intelligence-edge/src/index.mjs","utf8");
    const serving=code.slice(code.indexOf("export default"));
    expect(serving.indexOf("const hotSnapshot = await readD1HotSnapshot(env);"))
      .toBeLessThan(serving.indexOf("const cached = await cache.match(cacheKey);"));
    expect(serving.indexOf("const cached = await cache.match(cacheKey);"))
      .toBeLessThan(serving.indexOf("const response = await buildResponse(env);"));
    expect(code.indexOf("reserveB2AccountQuota(env.B2_QUOTA_DB"))
      .toBeLessThan(code.indexOf("const path ="));
    expect(code).toContain("signedGet(PROOF_KEY, env)");
    expect(code).toContain('proof?.raw_source_headlines_exposed !== false');
    expect(code).toContain('proof?.provider_identity_exposed !== false');
    expect(code).toContain('Date.now() - verifiedB2GeneratedAt > MAX_AGE_MS');
  });

  it("production deploy binds schema>=5 and is never an unqualified six-hour recurring job",()=>{
    const wf=readFileSync(".github/workflows/deploy-intelligence-edge.yml","utf8");
    expect(wf).not.toContain('cron: "43 */6 * * *"');
    expect(wf).not.toContain("\n  schedule:");
    expect(wf).toContain("  push:");
    expect(wf).toContain("  workflow_dispatch:");
    expect(wf).toContain("prepare-edge-continuity.sh");
    expect(wf).toContain("geomacro.public-intelligence-direct-postgres-publish.v2");
    expect(wf).toContain("INTELLIGENCE_SHARED_B2_D1_SCHEMA_V5_REQUIRED");
    expect(wf).toContain("configure-intelligence-edge-d1-quota.mjs");
    expect(wf).toContain("wrangler.runtime.jsonc");
    expect(wf).toContain("d1 execute B2_QUOTA_DB");
    expect(wf).toContain("scripts/ops/verify-live-intelligence-overlay-convergence.mjs");
    expect(wf).not.toContain("wrangler d1 create");
  });
});
