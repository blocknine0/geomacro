import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchFirstPartyOriginalFeed } from "@/lib/stateless-public-intelligence.server";
import {
  deriveStatelessSignals, parseFirstPartyFeed, type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const now = Date.parse("2026-10-13T00:00:00.000Z");
const bank: StatelessSourceSpec = {
  id:"bis_press",category:"macro",media:"rss",
  url:"https://www.bis.org/doclist/all_pressrels.rss",
  allowedHosts:["www.bis.org"],credit:"Bank for International Settlements",
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
    expect(source).toContain('url: "https://www.bis.org/doclist/all_pressrels.rss"');
    const xml="<rss><channel><item>"+
      "<title>Basel III applicable in almost all member jurisdictions by 2027</title>"+
      "<link>https://www.bis.org/press/p261005.htm</link>"+
      "<pubDate>Mon, 05 Oct 2026 02:00:00 GMT</pubDate>"+
      "</item><item>"+
      "<title>Basel Committee discusses banking supervision and regulation</title>"+
      "<link>https://www.bis.org/press/p261001.htm</link>"+
      "<pubDate>Thu, 01 Oct 2026 02:00:00 GMT</pubDate>"+
      "</item></channel></rss>";
    const parsed=parseFirstPartyFeed(xml,bank,now);
    expect(parsed.metrics.native_clock_valid).toBe(2);
    const out=deriveStatelessSignals(parsed.dated,now);
    expect(out).toHaveLength(2);
    expect(out.every(x=>x.category==="macro" && x.severity===null &&
      x.same_event_corrob_verified===false)).toBe(true);
    expect(out[0].published_at).toBe("2026-10-05T02:00:00.000Z");
    expect(JSON.stringify(out)).not.toContain("https://");
    expect(JSON.stringify(out)).not.toContain("Basel III applicable in almost all member");
    expect(deriveStatelessSignals(parsed.dated.filter(x=>x.publishedAt.startsWith("2026-10-05")),Date.parse("2026-10-05T02:14:59.000Z")))
      .toHaveLength(0);
  });

  it("accepts only the independently observed first-party RSS1/RDF media envelope and native dc:date",()=>{
    const rdf = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
      '<item rdf:about="https://www.bis.org/press/p261005.htm">' +
      '<title>Basel III applicable in almost all member jurisdictions by 2027</title>' +
      '<link>https://www.bis.org/press/p261005.htm</link>' +
      '<dc:date>2026-10-05T02:00:00Z</dc:date>' +
      '<dc:modified>2026-10-12T23:00:00Z</dc:modified>' +
      '</item></rdf:RDF>';
    const p=parseFirstPartyFeed(rdf,bank,now);
    expect(p.metrics.seen).toBe(1);
    expect(p.metrics.native_clock_valid).toBe(1);
    expect(deriveStatelessSignals(p.dated,now)).toHaveLength(1);
    expect(p.dated[0].publishedAt).toBe("2026-10-05T02:00:00.000Z");
    const unknown={...bank,id:"unverified_rdf"};
    expect(parseFirstPartyFeed(rdf,unknown,now).dated).toHaveLength(0);
    // Never accept an untimed calendar day or a modification-only date.
    expect(parseFirstPartyFeed(rdf.replace("2026-10-05T02:00:00Z","2026-10-05"),bank,now).dated).toHaveLength(0);
    expect(parseFirstPartyFeed(rdf.replace(/<dc:date>[\s\S]*?<\/dc:date>/u,""),bank,now).dated).toHaveLength(0);
  });

  it("follows one allowed HTTPS same-government RSS redirect, never mutating the original signal date",async()=>{
    const follow="https://natural-resources.canada.ca/news/feed.xml";
    const mock=vi.fn(async (u:RequestInfo|URL, _init?:RequestInit)=>String(u)===minerals.url?move(follow):ok);
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
    const bankMock=vi.fn(async()=>move("https://www.bis.org/other/rss.xml"));
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
