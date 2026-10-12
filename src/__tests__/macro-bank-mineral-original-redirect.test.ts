import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchFirstPartyOriginalFeed } from "@/lib/stateless-public-intelligence.server";
import {
  deriveStatelessSignals, parseFirstPartyFeed, type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const now = Date.parse("2026-10-13T00:00:00.000Z");
const bank: StatelessSourceSpec = {
  id:"rba_media",category:"macro",media:"rss",
  url:"https://www.rba.gov.au/rss/rss-cb-media-releases.xml",
  allowedHosts:["www.rba.gov.au"],credit:"Reserve Bank of Australia",
};
const minerals: StatelessSourceSpec = {
  id:"nrcan_science",category:"rare_earth",media:"rss",
  url:"https://natural-resources.canada.ca/simply-science/rss.xml",
  allowedHosts:["natural-resources.canada.ca","www.natural-resources.canada.ca"],credit:null,
};
const ok = new Response("<?xml version='1.0'?><rss><channel></channel></rss>",{
  status:200,headers:{"content-type":"application/rss+xml"},
});
const move = (location:string)=>new Response(null,{
  status:301,headers:{location},
});

describe("first-party bank Macro release and bounded mineral redirect",()=>{
  it("uses the actual central-bank-published feed and its original native publication clock",()=>{
    const source=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
    expect(source).toContain('url: "https://www.rba.gov.au/rss/rss-cb-media-releases.xml"');
    const xml="<rss><channel><item>"+
      "<title>Release of Financial Stability Review – October 2026</title>"+
      "<link>https://www.rba.gov.au/media-releases/2026/mr-26-28.html</link>"+
      "<pubDate>Thu, 01 Oct 2026 02:00:00 GMT</pubDate>"+
      "</item><item>"+
      "<title>Statement by the Monetary Policy Board: Monetary Policy Decision</title>"+
      "<link>https://www.rba.gov.au/media-releases/2026/mr-26-27.html</link>"+
      "<pubDate>Tue, 29 Sep 2026 02:00:00 GMT</pubDate>"+
      "</item></channel></rss>";
    const parsed=parseFirstPartyFeed(xml,bank,now);
    expect(parsed.metrics.native_clock_valid).toBe(2);
    const out=deriveStatelessSignals(parsed.dated,now);
    expect(out).toHaveLength(2);
    expect(out.every(x=>x.category==="macro" && x.severity===null &&
      x.same_event_corrob_verified===false)).toBe(true);
    expect(out[0].published_at).toBe("2026-10-01T02:00:00.000Z");
    expect(JSON.stringify(out)).not.toContain("https://");
    expect(JSON.stringify(out)).not.toContain("Release of Financial Stability Review");
    expect(deriveStatelessSignals(parsed.dated,Date.parse("2026-10-01T02:14:59.000Z")))
      .toHaveLength(0);
  });

  it("follows one allowed HTTPS same-government RSS redirect, never mutating the original signal date",async()=>{
    const follow="https://natural-resources.canada.ca/news/feed.xml";
    const mock=vi.fn(async (u:RequestInfo|URL)=>String(u)===minerals.url?move(follow):ok);
    const response=await fetchFirstPartyOriginalFeed(minerals,mock as unknown as typeof fetch);
    expect(response.ok).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1]?.[0]).toBe(follow);
    expect(mock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("does not follow off-host, HTTP, unknown first-party path, credential, or third-party redirects",async()=>{
    for(const location of [
      "https://evil.example.com/rss.xml",
      "http://natural-resources.canada.ca/news/feed.xml",
      "https://user:secret@natural-resources.canada.ca/news/feed.xml",
      "https://natural-resources.canada.ca/government/news/latest",
      "https://natural-resources.canada.ca//external/rss.xml",
    ]){
      const mock=vi.fn(async()=>move(location));
      const response=await fetchFirstPartyOriginalFeed(minerals,mock as unknown as typeof fetch);
      expect(response.status).toBe(301);
      expect(mock).toHaveBeenCalledTimes(1);
    }
    const bankMock=vi.fn(async()=>move("https://www.rba.gov.au/other/rss.xml"));
    const bankResult=await fetchFirstPartyOriginalFeed(bank,bankMock as unknown as typeof fetch);
    expect(bankResult.status).toBe(301);
    expect(bankMock).toHaveBeenCalledTimes(1);
  });

  it("caps redirects at two moves and never retries HTTP 403/429 or 500",async()=>{
    const mock=vi.fn(async (url:RequestInfo|URL)=>{
      const current=String(url);
      return current.includes("rss.xml")?move("https://natural-resources.canada.ca/a/feed.xml")
        :current.includes("a/feed.xml")?move("https://natural-resources.canada.ca/b/rss.xml")
        :move("https://natural-resources.canada.ca/c/rss.xml");
    });
    const result=await fetchFirstPartyOriginalFeed(minerals,mock as unknown as typeof fetch);
    expect(result.status).toBe(301);
    expect(mock).toHaveBeenCalledTimes(3);
    for(const status of [403,429,500]){
      const refusal=vi.fn(async()=>new Response(null,{status}));
      const resp=await fetchFirstPartyOriginalFeed(minerals,refusal as unknown as typeof fetch);
      expect(resp.status).toBe(status);
      expect(refusal).toHaveBeenCalledTimes(1);
    }
  });
});
