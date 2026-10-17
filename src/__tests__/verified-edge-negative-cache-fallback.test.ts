import {readFileSync} from "node:fs";
import {afterEach,describe,expect,it,vi} from "vitest";
import globalRiskWorker from "../../workers/global-risk-edge/src/index.mjs";
import intelligenceWorker from "../../workers/intelligence-edge/src/index.mjs";
import riskIndicesWorker from "../../workers/risk-indices-edge/src/index.mjs";

const fixtures=[
  {name:"global-risk",worker:globalRiskWorker,path:"/global-risk",call:"buildContinuityResponse()"},
  {name:"intelligence",worker:intelligenceWorker,path:"/intelligence",call:"buildContinuityResponse(env)"},
  {name:"risk-indices",worker:riskIndicesWorker,path:"/risk-indices",call:"buildContinuityResponse()"},
] as const;
const ctx={waitUntil:()=>undefined};
const controlPlane={fetch:async()=>Response.json({
  ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID",
},{status:503})};

afterEach(()=>vi.unstubAllGlobals());

describe("Supabase unavailable / B2 shared quota exhausted: independent verified fallback",()=>{
  it.each(fixtures)(
    "$name tries independently verified zero-B2 continuation even with 120s negative POP marker",
    async({name,worker,path,call})=>{
      // The checked-in production materializer installs verified continuity
      // only from real main successful B2 full readback. In source checkout
      // continuity.mjs is intentionally null: missing backup MUST remain 503.
      const code=readFileSync(`workers/${name}-edge/src/index.mjs`,"utf8");
      const negative=code.indexOf("if (await failedB2OriginRecently(cache, negativeKey))");
      const end=code.indexOf("    try {\n      const response = await buildResponse(env);",negative);
      expect(negative).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(negative);
      const segment=code.slice(negative,end);
      expect(segment).toContain(call);
      expect(segment).toContain("ctx.waitUntil(cache.put(cacheKey, recovered.clone()))");
      expect(segment).toContain("return recovered;");
      expect(segment).toContain("return unavailable(503);");
      expect(segment).not.toContain("signedGet(");
      expect(segment).not.toContain("reserveB2AccountQuota");
      const cacheReads:string[]=[];
      const cachePut=vi.fn(async()=>undefined);
      vi.stubGlobal("caches",{
        default:{
          match:async(request:Request)=>{
            cacheReads.push(request.url);
            return new URL(request.url).searchParams.has("__geomacro_private_b2_failed")?
              new Response("",{status:200,headers:{
                "x-geomacro-internal-b2-origin-failure":"1",
              }}):null;
          },
          put:cachePut,
        },
      });
      const b2=vi.fn(async()=>{throw Error("ANY_B2_GET_WHEN_NEGATIVE_FORBIDDEN");});
      vi.stubGlobal("fetch",b2);
      const env={CONTROL_PLANE:controlPlane};
      const response=await worker.fetch(new Request("https://edge.test"+path),env,ctx);
      expect(response.status).toBe(503);
      expect(b2).not.toHaveBeenCalled();
      expect(cacheReads.some(x=>x.includes("__geomacro_private_b2_failed"))).toBe(true);
      expect(cachePut).not.toHaveBeenCalled();
    },
  );
  it("does not introduce Supabase on website-only historical GRI, or interfere with x402 live path",()=>{
    const site=readFileSync("src/lib/global-risk-read.server.ts","utf8");
    const historical=site.slice(site.indexOf("export async function readWebsiteLaggedGlobalRisk"));
    const machine=readFileSync("src/lib/production-global-risk.server.ts","utf8");
    expect(historical).toContain("v1/public/website-lagged-global-risk");
    expect(historical).toContain("readB2PublicRisk()");
    expect(historical).not.toContain("getAppSupabase()");
    expect(historical).not.toContain('.from("gri_snapshots")');
    expect(machine).toContain("readB2PublicRisk()");
    expect(machine).not.toContain("websitePublicCutoff");
    expect(machine).not.toContain("SupabaseClient");
  });
});
