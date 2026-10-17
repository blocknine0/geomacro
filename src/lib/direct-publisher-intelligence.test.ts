import {describe,it,expect,vi} from "vitest";
import {discoverDirectPublisherForPrivateQualification} from "./on-demand-global-discovery.server";

describe("direct official publisher profile of the canonical engine",()=>{
 it("reads all three categories without Telegram, discovery indexes or annual statistics",async()=>{
  const now=new Date("2026-10-17T12:00:00Z"),seen:string[]=[];
  const fetchImpl=vi.fn(async(input:RequestInfo|URL)=>{
   const u=new URL(String(input));seen.push(u.href);
   if(u.hostname==="www.federalreserve.gov")return new Response('<rss><channel><item>'+ 
    '<title>India monetary policy inflation review</title><pubDate>Sat, 17 Oct 2026 11:00:00 GMT</pubDate>'+
    '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261017a.htm</link></item></channel></rss>');
   if(u.hostname==="news.un.org")return new Response('<rss><channel><item>'+ 
    '<title>India conflict security council peace review</title><pubDate>Sat, 17 Oct 2026 11:00:00 GMT</pubDate>'+
    '<link>https://news.un.org/en/story/2026/10/1150000</link></item></channel></rss>');
   if(u.hostname==="www.gov.uk"&&u.pathname.endsWith(".atom"))return new Response('<feed><entry>'+ 
    '<title>India lithium critical minerals mining review</title><published>2026-10-17T11:00:00Z</published>'+
    '<link rel="alternate" href="https://www.gov.uk/government/news/india-critical-minerals-mining-review"/></entry></feed>');
   return new Response('<rss><channel></channel></rss>');
  }) as typeof fetch;
  const out=await discoverDirectPublisherForPrivateQualification({country_iso3:"IND",
   categories:["geopolitics","macro","rare_earth"]},{now,fetchImpl});
  expect(new Set(out.private_candidates.map(c=>c.domain))).toEqual(new Set(["geopolitics","macro","rare_earth"]));
  expect(seen.every(url=>!/(telegram|t\.me|worldbank|gdelt|reliefweb)/u.test(url))).toBe(true);
  expect(out.private_macro_changes).toEqual([]);
  expect(out.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(out.discovery).toMatchObject({payable:false,raw_upstream_delivered:false,
   supabase_requests:0,b2_requests:0,settlement_attempted:false});
 });
 it("rejects unsupported country before any provider call",async()=>{
  const fetchImpl=vi.fn();
  await expect(discoverDirectPublisherForPrivateQualification({country_iso3:"ZZZ",categories:["macro"]},
   {fetchImpl})).rejects.toThrow("ON_DEMAND_COUNTRY_INVALID");
  expect(fetchImpl).not.toHaveBeenCalled();
 });
});
