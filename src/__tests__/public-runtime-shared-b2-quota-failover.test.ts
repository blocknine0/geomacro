import {afterEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {readB2PublicIntelligence,readB2PublicRisk} from "../lib/b2-live.server";
import {readPublicIntelligenceRows} from "../lib/public-intelligence.functions";

afterEach(()=>vi.unstubAllGlobals());

describe("permanent frozen Supabase / exhausted shared-B2-quota public failover",()=>{
 it("never issues a direct S3 GET or Supabase retry after all verified public edge caches return 503",async()=>{
  const attempts:string[]=[];
  const fetchImpl=vi.fn(async(input:RequestInfo|URL)=>{
   const endpoint=String(input);attempts.push(endpoint);
   if(endpoint.includes("supabase.co")||endpoint.includes("backblazeb2.com")||
      endpoint.includes("s3.us-east")){
    throw Error("UNMETERED_B2_OR_SUPABASE_ACCESS_FORBIDDEN");
   }
   return Response.json({ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID"},{
    status:503,headers:{"content-type":"application/json"}
   });
  });
  vi.stubGlobal("fetch",fetchImpl);
  expect(await readB2PublicIntelligence()).toBeNull();
  expect(await readB2PublicRisk()).toBeNull();
  expect(await readPublicIntelligenceRows()).toEqual([]);
  expect(attempts).toHaveLength(3);
  expect(attempts.every(u=>u.startsWith("https://geomacro-")&&
    u.endsWith(".workers.dev/"+(u.includes("intelligence")?"intelligence":"global-risk")))).toBe(true);
  expect(attempts.some(u=>u.includes("supabase.co")||u.includes("backblazeb2.com"))).toBe(false);
 });
 it("public-data readers have exactly edge-only terminal behavior, while other B2 archiving remains separated",()=>{
  const b2=readFileSync("src/lib/b2-live.server.ts","utf8");
  const intel=b2.slice(b2.indexOf("export async function readB2PublicIntelligence()"),
    b2.indexOf("export async function readB2PublicRisk()"));
  const gri=b2.slice(b2.indexOf("export async function readB2PublicRisk()"),
    b2.indexOf("export async function readB2SourceNetworkStatus()"));
  expect(intel).toContain("return readPublicIntelligenceEdge();");
  expect(gri).toContain("return readGlobalRiskEdge();");
  expect(intel).not.toContain("readJsonGzip");
  expect(gri).not.toContain("readJsonGzip");
  expect(intel).not.toContain("signedGet");
  expect(gri).not.toContain("signedGet");
  const api=readFileSync("src/lib/public-intelligence.functions.ts","utf8");
  const active=api.slice(api.indexOf("export async function readPublicIntelligenceRows():"),
    api.indexOf("export const getPublicIntelligence"));
  expect(active).toContain("await readB2PublicIntelligence()");
  expect(active).not.toContain("readPublicIntelligenceRowsFromSupabase()");
  const workers=[
    "workers/intelligence-edge/src/index.mjs",
    "workers/global-risk-edge/src/index.mjs",
    "workers/risk-indices-edge/src/index.mjs",
  ];
  for(const path of workers){
   const code=readFileSync(path,"utf8");
   expect(code).toContain("reserveB2AccountQuota");
   expect(code).toContain("B2_QUOTA_DB");
  }
  expect(readFileSync("workers/control-plane/src/b2-account-quota.mjs","utf8"))
   .toContain("ATOMIC_B2_QUOTA_SQL");
 });
 it("website-only GRI still retains genuine 60m proof delay, and machine APIs remain unlagged",()=>{
  const website=readFileSync("src/lib/global-risk-read.server.ts","utf8");
  const lag=website.slice(website.indexOf("export async function readWebsiteLaggedGlobalRisk("));
  expect(lag).toContain("/v1/public/website-lagged-global-risk");
  expect(lag).toContain("readGlobalRiskEdge()");
  expect(lag).not.toContain("getAppSupabase()");
  const machine=readFileSync("src/lib/production-global-risk.server.ts","utf8");
  expect(machine).toContain("readB2PublicRisk()");
  expect(machine).not.toContain("websitePublicCutoff");
 });
});
