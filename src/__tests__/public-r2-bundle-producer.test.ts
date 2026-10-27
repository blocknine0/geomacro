import {describe,it,expect} from "vitest";
import {buildPublicNewsR2Snapshot}
  from "../../scripts/ops/publish-public-news-r2-snapshot.mjs";

const timestamp="2026-10-27T08:00:00.000Z";
const sha="a".repeat(40);
const categories=["geopolitics","macro","rare_earth"];
const journal={
 ok:true,schema:"geomacro.website-derived-news-bundle.v1",
 checked_at:timestamp,original_release_delay_minutes:0,
 retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
 complete:true,item_cap:600,returned_rows:0,
 ingest_clock_kind:"D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER",
 first_ingest:[],signals:[],scored:false,chargeable:false,
 supabase_dependency:false,
};
const machine={
 ok:true,schema:"geomacro.derived-news-structural-feed.v1",
 projection:"source_neutral",chargeable:false,scored:false,signed:false,
 commercial_rights_verified:false,
 partner_resale_or_commercial_redistribution_authorized:false,
 raw_upstream_delivered:false,items:[],
 counts:Object.fromEntries(categories.map(x=>[x,0])),
 availability_by_category:Object.fromEntries(categories.map(x=>[x,{}])),
};
describe("R2 public snapshot producer: no repeated D1 journal offset reads",()=>{
 it("reads health, one 600-row-bounded journal bundle and one structural projection",async()=>{
  const urls:string[]=[];
  const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(String(input)).pathname;
   urls.push(path);
   expect(init?.method).toBe("GET");
   expect((init?.headers as Record<string,string>)["Cache-Control"]).toBe("no-cache");
   if(path==="/health")return Response.json({ok:true,deployed_source_sha:sha});
   if(path==="/v1/public/website-derived-news-bundle")return Response.json(journal);
   if(path==="/v1/public/derived-structural-72h")return Response.json(machine);
   throw Error("UNEXPECTED_D1_READ");
  }) as typeof fetch;
  const proof=await buildPublicNewsR2Snapshot({now:new Date(timestamp),fetchImpl});
  expect(proof.metrics).toMatchObject({total:0,neutral:0});
  expect(Object.keys(proof.value.pages)).toEqual(["0"]);
  expect(proof.value.pages["0"].has_more).toBe(false);
  expect(urls).toEqual([
   "/health",
   "/v1/public/website-derived-news-bundle",
   "/v1/public/derived-structural-72h",
  ]);
  expect(urls.some(x=>x.includes("offset"))).toBe(false);
 });
 it("refuses a malformed input bundle and never publishes a substitute page",async()=>{
  const calls:string[]=[];
  const fetchImpl=(async(input:RequestInfo|URL)=>{
    const path=new URL(String(input)).pathname;
    calls.push(path);
    if(path==="/health")return Response.json({ok:true,deployed_source_sha:sha});
    return Response.json({...journal,complete:false});
  }) as typeof fetch;
  await expect(buildPublicNewsR2Snapshot({now:new Date(timestamp),fetchImpl}))
   .rejects.toThrow("R2_SOURCE_D1_BUNDLE_CONTRACT_INVALID");
  expect(calls).toEqual(["/health","/v1/public/website-derived-news-bundle"]);
 });
});
