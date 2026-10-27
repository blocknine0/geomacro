import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {readOwnerOriginalNews} from "./owner-original-news.server";
const url="https://geomacro-telegram-owner-alerts.example.workers.dev/v1/private/owner-news";
const item={id:"a".repeat(64),category:"GEOPOLITICS",source_id:"white_house_actions",
 title:"President announces new executive order on sanctions",
 article_url:"https://www.whitehouse.gov/presidential-actions/new-order/",
 published_at:new Date().toISOString(),delivered_at:new Date().toISOString()};
const reply={schema:"geomacro.private-owner-original-news.v1",
 source:"FIRST_PARTY_OFFICIAL_RELEASES",verification_status:"UNVERIFIED",
 commercial_eligible:false,items:[item]};
describe("read-only owner official Telegram alert consumer",()=>{
 beforeEach(()=>{
  vi.stubEnv("GEOMACRO_OWNER_NEWS_READ_URL",url);
  vi.stubEnv("GEOMACRO_OWNER_NEWS_READ_TOKEN","r".repeat(40));
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
 it("uses GET with bearer and reads only unverified official source metadata",async()=>{
  const mock=vi.fn(async()=>Response.json(reply));
  const result=await readOwnerOriginalNews(mock);
  expect(result.status).toBe("AVAILABLE");
  expect(result.items).toHaveLength(1);
  const [destination,options]=mock.mock.calls[0] as unknown as [string,RequestInit];
  expect(destination).toBe(url);
  expect(options.method).toBe("GET");
  expect(options.body).toBeUndefined();
  expect(result.commercial_eligible).toBe(false);
 });
 it("rejects producer injected Telegram post or verified flag",async()=>{
  expect((await readOwnerOriginalNews(async()=>Response.json({
   ...reply,items:[{...item,post_text:"from private Telegram group"}]}))).status).toBe("UNAVAILABLE");
  expect((await readOwnerOriginalNews(async()=>Response.json({
   ...reply,verification_status:"VERIFIED"}))).status).toBe("UNAVAILABLE");
 });
 it("rejects external article URL",async()=>{
  const result=await readOwnerOriginalNews(async()=>Response.json({
   ...reply,items:[{...item,article_url:"https://attacker.invalid/phish"}]}));
  expect(result.status).toBe("UNAVAILABLE");
 });
 it("cannot access localhost or insecure endpoint",async()=>{
  vi.stubEnv("GEOMACRO_OWNER_NEWS_READ_URL","http://localhost/v1/private/owner-news");
  const fetcher=vi.fn();
  expect((await readOwnerOriginalNews(fetcher)).status).toBe("NOT_CONFIGURED");
  expect(fetcher).not.toHaveBeenCalled();
 });
});
