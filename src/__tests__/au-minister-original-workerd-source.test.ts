import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {acceptedOriginalArticleLink,deriveStatelessSignals,
 parseFirstPartyFeed,type StatelessSourceSpec} from "../lib/stateless-intelligence-model";
import {fetchFirstPartyOriginalFeed} from "../lib/stateless-public-intelligence.server";

const uri="https://www.minister.industry.gov.au/t-ayres/media/construction-starts-arafura-rare-earths-project";
const issued=Date.parse("2026-10-08T04:15:00.000Z");
const now=Date.parse("2026-10-13T09:40:00.000Z");
const feed:StatelessSourceSpec={
 id:"au_industry_minister",category:"rare_earth",media:"rss",
 url:"https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
 allowedHosts:["www.minister.industry.gov.au"],credit:null,
};
const xml=(title:string,link=uri,pub="Thu, 08 Oct 2026 04:15:00 GMT")=>
 '<rss version="2.0"><channel><item><title>'+title+
 '</title><link>'+link+'</link><pubDate>'+pub+
 '</pubDate></item></channel></rss>';
const title="Construction starts on Arafura Rare Earths Project";
describe("Australian minister original-source, website-only activation",()=>{
 it("uses actual issuer RSS with native dates and a no-score derived card",()=>{
  const a=parseFirstPartyFeed(xml(title),feed,now);
  expect(a.metrics).toMatchObject({seen:1,relevant:1,original_link_valid:1,native_clock_valid:1});
  expect(a.dated).toHaveLength(1);
  expect(a.dated[0].publishedAt).toBe(new Date(issued).toISOString());
  expect(a.dated[0].articleUrl).toBe(uri);
  const out=deriveStatelessSignals(a.dated,now);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({category:"rare_earth",date_precision:"exact",
    severity:null,same_event_corrob_verified:false,status:"official_release_observed_unscored"});
  expect(JSON.stringify(out)).not.toContain(uri);
  expect(JSON.stringify(out)).not.toContain(title);
  expect(JSON.stringify(out)).not.toContain("www.minister.industry.gov.au");
 });
 it("enforces exact original future-clock rejection and native publication cutoff",()=>{
  const a=parseFirstPartyFeed(xml(title),feed,now);
  expect(deriveStatelessSignals(a.dated,issued-1)).toHaveLength(0);
  expect(deriveStatelessSignals(a.dated,issued)).toHaveLength(1);
  expect(deriveStatelessSignals(a.dated,issued+31*86400_000)).toHaveLength(0);
  for(const date of ["","2026-10-08","Tue, 13 Oct 2026 09:40:00"]){
   expect(parseFirstPartyFeed(xml(title,uri,date),feed,now).dated).toHaveLength(0);
  }
 });
 it("rejects source imposters, cross-minister links, arbitrary paths and queries",()=>{
  for(const u of [
   uri.replace("www.minister.industry.gov.au","www.minister.industry.gov.au.bad.invalid"),
   uri.replace("/t-ayres/","/king/"),uri.replace("/media/","/subscribe/"),
   uri+"?utm_source=tracking",uri+"#article",uri.replace("https:","http:"),
  ])expect(acceptedOriginalArticleLink(u,feed)).toBeNull();
  expect(parseFirstPartyFeed(xml("Speech to science arts award winners"),feed,now).dated).toHaveLength(0);
 });
 it("keeps workerd-safe manual redirection and never retries a failed original",async()=>{
  const calls=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
   expect(init?.redirect).toBe("manual");
   expect(init?.method).toBe("GET");
   return new Response(xml(title),{status:200});
  });
  const response=await fetchFirstPartyOriginalFeed(feed,calls as typeof fetch);
  expect(response.status).toBe(200);
  expect(calls).toHaveBeenCalledTimes(1);
  const moved=vi.fn(async()=>new Response(null,{status:302,
    headers:{Location:"https://example.invalid/redirect"}}));
  const denied=await fetchFirstPartyOriginalFeed(feed,moved as typeof fetch);
  expect(denied.status).toBe(302);
  expect(moved).toHaveBeenCalledTimes(1);
 });
 it("retries exactly once after a real timeout on the fixed Australian minister feed",async()=>{
  const transient=Object.assign(new Error("transient timeout"),{name:"TimeoutError"});
  const calls=vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce(
    new Response(xml(title),{status:200,headers:{"content-type":"application/rss+xml"}}));
  const reply=await fetchFirstPartyOriginalFeed(feed,calls as unknown as typeof fetch);
  expect(reply.status).toBe(200);
  expect(calls).toHaveBeenCalledTimes(2);
  expect(calls.mock.calls.every(c=>c[0]===feed.url && c[1]?.redirect==="manual")).toBe(true);
 });
 it("never retries a publisher refusal or an unrelated source failure",async()=>{
  for(const status of [403,429,500]){
    const calls=vi.fn(async()=>new Response(null,{status}));
    const reply=await fetchFirstPartyOriginalFeed(feed,calls as unknown as typeof fetch);
    expect(reply.status).toBe(status);
    expect(calls).toHaveBeenCalledTimes(1);
  }
  const other={...feed,id:"nrcan_science"};
  const noRetry=vi.fn().mockRejectedValue(Object.assign(new Error("timeout"),{name:"TimeoutError"}));
  await expect(fetchFirstPartyOriginalFeed(other,noRetry as unknown as typeof fetch)).rejects.toThrow("timeout");
  expect(noRetry).toHaveBeenCalledTimes(1);
 });
 it("does not alter commercial signing, D1, B2 or frozen Supabase",()=>{
  const site=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
  expect(site).toContain('id: "au_industry_minister"');
  expect(site).toContain("feed/t-ayres/rss.xml");
  expect(site).toContain('id: "au_resources_minerals_index"');
  expect(site).not.toContain("SUPABASE_DB_URL");
  expect(site).toContain('source.id === "au_industry_minister" ? 8_000 : TIMEOUT_MS');
  expect(site).not.toContain('redirect: source.id === "au_industry_minister" ? "error"');
 });
});
