import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchOfficialNativeArticles, OFFICIAL_NATIVE_FEEDS }
  from "../../scripts/lib/official-native-rss.mjs";
import { ORIGINAL_PUBLISHER_ALTERNATES }
  from "../../scripts/lib/official-native-alternates.mjs";
import {
  OFFICIAL_NATIVE_THIRD_FEEDS,
  fetchOfficialThirdPublisherArticles,
  parseOfficialThirdRss,
} from "../../scripts/lib/official-native-third-fallback.mjs";

const now = new Date("2026-10-09T18:10:00.000Z");
const title: Record<string,string> = {
  geopolitics:"United Nations Security Council discusses ceasefire after border conflict",
  macro:"European Central Bank discusses inflation and interest rates in the euro area",
  rare_earth:"USGS releases assessment of critical minerals deposits and lithium reserves",
};
const url: Record<string,string> = {
  geopolitics:"https://www.ungeneva.org/en/news-media/press/2026/10/latest-security",
  macro:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261009.en.html",
  rare_earth:"https://www.usgs.gov/news/national-news-release/minerals-lithium",
};
const rss=(category:string,link=url[category],pubdate="Fri, 09 Oct 2026 17:55:00 GMT",
  headline=title[category])=>
  '<rss version="2.0"><channel><item><title>'+headline+
  '</title><link>'+link+'</link><pubDate>'+pubdate+
  '</pubDate></item></channel></rss>';
const emptyRss='<rss version="2.0"><channel></channel></rss>';
const emptyAtom='<feed xmlns="http://www.w3.org/2005/Atom"></feed>';
const res=(body:string,type="application/rss+xml")=>
  new Response(body,{headers:{"content-type":type}});

describe("#1827 three-domain third publisher cold-source RSS",()=>{
  it.each(["geopolitics","macro","rare_earth"])(
    "%s accepts ONLY original native-published current article, private/unlicensed",
    domain=>{
      const stats:Record<string,number>={};
      const rows=parseOfficialThirdRss(rss(domain),domain,{now,diagnostics:stats});
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        sourceDomain:OFFICIAL_NATIVE_THIRD_FEEDS[domain].host,
        publishedAt:"2026-10-09T17:55:00.000Z",
        nativeTimeEvidence:"publisher_rss_item_pubDate",
        discoveryProvider:"official_native_rss",
        nativePublishedAtVerified:true,privateOnly:true,
        rightsVerified:false,commercialEligible:false,
      });
      expect(rows[0].url).toBe(url[domain]);
      expect(rows[0]).not.toHaveProperty("severity");
      expect(stats).toMatchObject({
        third_items_seen:1,third_native_pubdate_seen:1,
        third_original_current_count:1,third_exact_host_count:1,
        third_topic_match_count:1,third_private_eligible_count:1,
      });
      expect(JSON.stringify(stats)).not.toContain("ecb");
      expect(JSON.stringify(stats)).not.toContain("usgs");
    },
  );

  it("rejects future, stale, feed retrieval timestamp, wrong exact host and raw feed injections",()=>{
    expect(parseOfficialThirdRss(
      rss("geopolitics",url.geopolitics,"Fri, 09 Oct 2026 18:11:00 GMT"),
      "geopolitics",{now})).toEqual([]);
    expect(parseOfficialThirdRss(
      rss("macro",url.macro,"Thu, 08 Oct 2026 16:00:00 GMT"),
      "macro",{now})).toEqual([]);
    expect(parseOfficialThirdRss(
      rss("macro",url.macro,"not-a-pubdate"),
      "macro",{now})).toEqual([]);
    expect(parseOfficialThirdRss(
      rss("macro",url.macro,""),"macro",{now})).toEqual([]);
    expect(parseOfficialThirdRss(
      rss("macro","https://www.ecb.europa.eu.attacker.test/press",
        "Fri, 09 Oct 2026 17:55:00 GMT"),
      "macro",{now})).toEqual([]);
    expect(parseOfficialThirdRss(
      rss("rare_earth",url.rare_earth,
        "Fri, 09 Oct 2026 17:55:00 GMT",
        "Local school arts festival receives funds"),
      "rare_earth",{now})).toEqual([]);
    expect(()=>parseOfficialThirdRss(
      "<!DOCTYPE rss><rss version='2.0'></rss>",
      "geopolitics",{now})).toThrow("OFFICIAL_THIRD_RSS_INVALID");
    expect(()=>parseOfficialThirdRss("x".repeat(257*1024),
      "geopolitics",{now})).toThrow("OFFICIAL_THIRD_RSS_INVALID");
  });

  it("only fetches third source if BOTH first and second have no eligible original events",async()=>{
    const requests:string[]=[];
    const fetchImpl=vi.fn(async (u:string)=>{
      requests.push(u);
      if(u===OFFICIAL_NATIVE_FEEDS.macro.url)
        return res(emptyRss);
      if(u===ORIGINAL_PUBLISHER_ALTERNATES.macro.url)
        return res(emptyAtom,"application/atom+xml");
      if(u===OFFICIAL_NATIVE_THIRD_FEEDS.macro.url)
        return res(rss("macro"));
      throw Error("UNTRUSTED_URL");
    });
    const diagnostic:Record<string,unknown>={};
    const rows=await fetchOfficialNativeArticles("macro",{
      now,fetchImpl,diagnostics:diagnostic,
      includeSecondPublisher:true,includeThirdPublisher:true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceDomain).toBe("www.ecb.europa.eu");
    expect(requests).toEqual([
      OFFICIAL_NATIVE_FEEDS.macro.url,
      ORIGINAL_PUBLISHER_ALTERNATES.macro.url,
      OFFICIAL_NATIVE_THIRD_FEEDS.macro.url,
    ]);
    expect(diagnostic).toMatchObject({
      primary_feed_ok:true,alternate_feed_ok:true,
      third_feed_attempted:true,third_feed_ok:true,
      third_private_eligible_count:1,
    });
  });

  it("never fetches third source when an earlier valid original article exists",async()=>{
    const fetched:string[]=[];
    const fetchImpl=vi.fn(async (u:string)=>{
      fetched.push(u);
      if(u===OFFICIAL_NATIVE_FEEDS.geopolitics.url)
        return res(emptyRss);
      if(u===ORIGINAL_PUBLISHER_ALTERNATES.geopolitics.url)
        return res('<rss version="2.0"><channel><item><title>'+
          'UN Security Council calls for immediate ceasefire amid armed conflict'+
          '</title><link>https://news.un.org/en/story/2026/10/1234</link>'+
          '<pubDate>Fri, 09 Oct 2026 17:55:00 GMT</pubDate></item></channel></rss>');
      throw Error("THIRD_SOURCE_SHOULD_NOT_BE_FETCHED");
    });
    const rows=await fetchOfficialNativeArticles("geopolitics",{
      now,fetchImpl,includeThirdPublisher:true,includeSecondPublisher:true,
    });
    expect(rows).toHaveLength(1);
    expect(fetched).toHaveLength(2);
  });

  it("never treats third transport errors as real news or overrides rights gate",async()=>{
    const fetchImpl=vi.fn(async (u:string)=>{
      if(u===OFFICIAL_NATIVE_FEEDS.rare_earth.url)return res(emptyRss);
      if(u===ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url)
        return res(emptyAtom,"application/atom+xml");
      return new Response("unavailable",{status:403});
    });
    const diagnostic:Record<string,unknown>={};
    const rows=await fetchOfficialNativeArticles("rare_earth",{
      now,fetchImpl,includeThirdPublisher:true,diagnostics:diagnostic,
    });
    expect(rows).toEqual([]);
    expect(diagnostic.third_feed_attempted).toBe(true);
    expect(diagnostic.third_feed_ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("enforces fixed HTTPS endpoints, no redirects, bounded bodies and private-only integration",async()=>{
    const calls:any[]=[];
    const fetchImpl=vi.fn(async (u:string,opts:RequestInit)=>{
      calls.push({u,opts});
      return res(rss("macro"));
    });
    const rows=await fetchOfficialThirdPublisherArticles("macro",{now,fetchImpl});
    expect(rows).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].u).toBe("https://www.ecb.europa.eu/rss/press.html");
    expect(calls[0].opts.redirect).toBe("error");
    const ingest=readFileSync("scripts/ingest-news.js","utf8");
    expect(ingest).toContain("includeThirdPublisher: true");
    expect(ingest).toContain("privatePublisherPreAdmission(article");
    expect(ingest).toContain("const gated = passesGates(article, assessment, category.name)");
    expect(ingest).toContain("makePrivateStageRecord({");
    expect(ingest).not.toContain("publishThirdSourceToCommercial");
  });
});
