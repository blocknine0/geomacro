import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import intelligenceWorker from "../../workers/intelligence-edge/src/index.mjs";
import globalRiskWorker from "../../workers/global-risk-edge/src/index.mjs";
import riskIndicesWorker from "../../workers/risk-indices-edge/src/index.mjs";
import {
  B2_ORIGIN_FAILURE_TTL_SECONDS,
  b2OriginFailureCacheKey,
  failedB2OriginRecently,
  rememberFailedB2Origin,
} from "../../workers/shared/b2-origin-negative-cache.mjs";

afterEach(()=>vi.unstubAllGlobals());
const products=[
  {path:"/intelligence",code:"workers/intelligence-edge/src/index.mjs",worker:intelligenceWorker},
  {path:"/global-risk",code:"workers/global-risk-edge/src/index.mjs",worker:globalRiskWorker},
  {path:"/risk-indices",code:"workers/risk-indices-edge/src/index.mjs",worker:riskIndicesWorker},
];

function cacheHarness(){
  const store=new Map<string,Response>();
  const calls:string[]=[];
  const cache={
    async match(key:Request){
      calls.push(key.url);
      return store.get(key.url)?.clone()??null;
    },
    async put(key:Request,value:Response){store.set(key.url,value.clone());},
  };
  vi.stubGlobal("caches",{default:cache});
  return {cache,store,calls};
}
const noHot={
  fetch:async()=>Response.json({ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID"},{status:503}),
};

describe("#1827 avoid redundant private B2 cold-origin downloads on the same Cloudflare POP",()=>{
  it("strictly validates private marker HTTPS origin and product and stores only 120-second internal marker",async()=>{
    expect(B2_ORIGIN_FAILURE_TTL_SECONDS).toBe(120);
    const {cache}=cacheHarness();
    const key=b2OriginFailureCacheKey("https://edge.test","/global-risk");
    expect(key.url).toBe("https://edge.test/global-risk?__geomacro_private_b2_failed=v1");
    expect(await failedB2OriginRecently(cache,key)).toBe(false);
    expect(await rememberFailedB2Origin(cache,key)).toBe(true);
    expect(await failedB2OriginRecently(cache,key)).toBe(true);
    const cached=await cache.match(key);
    expect(cached?.status).toBe(200);
    expect(cached?.headers.get("cache-control")).toContain("max-age=120");
    expect(await cached?.text()).toBe("");
    expect(()=>b2OriginFailureCacheKey("http://edge.test","/global-risk"))
      .toThrow("B2_ORIGIN_CACHE_ORIGIN_INVALID");
    expect(()=>b2OriginFailureCacheKey("https://edge.test","/paid-risk"))
      .toThrow("B2_ORIGIN_CACHE_PRODUCT_INVALID");
  });

  it.each(products)("$path skips a second B2 cold-origin attempt while STILL publicly returning HTTP 503",async product=>{
    const {store}=cacheHarness();
    let requests=0;
    const fetch=vi.fn(async()=>{
      requests+=1;
      throw new Error("B2_PROVIDER_TEMPORARILY_UNAVAILABLE");
    });
    vi.stubGlobal("fetch",fetch);
    const pending:Promise<unknown>[]=[];
    const ctx={waitUntil(promise:Promise<unknown>){pending.push(promise);}};
    const env={
      CONTROL_PLANE:noHot,
      B2_KEY_ID:"read-only-test-key",
      B2_APPLICATION_KEY:"read-only-test-secret",
      // D1 quota missing: fails closed *before* attempting unmetered B2 I/O.
    };
    const req=()=>new Request("https://edge.test"+product.path);
    const first=await product.worker.fetch(req(),env,ctx);
    await Promise.all(pending);
    expect(first.status).toBe(503);
    expect((await first.json()).ok).toBe(false);
    expect(requests).toBe(0);
    const marker=b2OriginFailureCacheKey("https://edge.test",product.path);
    expect(store.has(marker.url)).toBe(true);
    const second=await product.worker.fetch(req(),env,ctx);
    expect(second.status).toBe(503);
    expect(second.headers.get("x-geomacro-authority")).toBeNull();
    expect(second.headers.get("cache-control")).toBe("no-store");
    expect(requests).toBe(0);
    const direct=await product.worker.fetch(
      new Request("https://edge.test"+product.path+"?__geomacro_private_b2_failed=v1"),env,ctx);
    expect(direct.status).toBe(404);
    expect((await direct.json()).ok).toBe(false);
  });

  it.each(products)("$path always prioritizes new verified D1 hot/positive cache before private failure marker",product=>{
    const src=readFileSync(product.code,"utf8");
    const serving=src.slice(src.indexOf("export default"));
    const d1=serving.indexOf("const hotSnapshot = await readD1HotSnapshot(env);");
    const cached=serving.indexOf("const cached = await cache.match(cacheKey);");
    const failed=serving.indexOf("if (await failedB2OriginRecently(cache, negativeKey))");
    const origin=serving.indexOf("const response = await buildResponse(env);");
    const set=serving.indexOf("ctx.waitUntil(rememberFailedB2Origin(cache, negativeKey));");
    expect(d1).toBeGreaterThan(0);
    expect(cached).toBeGreaterThan(d1);
    expect(failed).toBeGreaterThan(cached);
    expect(origin).toBeGreaterThan(failed);
    expect(set).toBeGreaterThan(origin);
    expect(serving.slice(set)).toContain("return unavailable(503);");
    expect(src).toContain('reserveB2AccountQuota(env.B2_QUOTA_DB');
    expect(src).toContain('if (url.pathname !== "'+product.path+'" || url.search)');
    expect(src).toContain('../../shared/b2-origin-negative-cache.mjs');
  });

  it("cache transport failure cannot bypass D1 global B2 governor or claim success",async()=>{
    const broken={match:async()=>{throw Error("CACHE_UNAVAILABLE");},
      put:async()=>{throw Error("CACHE_UNAVAILABLE");}};
    const key=b2OriginFailureCacheKey("https://edge.test","/intelligence");
    expect(await failedB2OriginRecently(broken,key)).toBe(false);
    expect(await rememberFailedB2Origin(broken,key)).toBe(false);
  });
});
