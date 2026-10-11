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
  geopolitics:"United Kingdom Foreign Secretary statement on ceasefire after border conflict",
  macro:"European Central Bank discusses inflation and interest rates in the euro area",
  rare_earth:"UK announces critical minerals supply and lithium processing partnership",
};
const url: Record<string,string> = {
  geopolitics:"https://www.gov.uk/government/news/uk-foreign-policy-security-statement",
  macro:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261009.en.html",
  rare_earth:"https://www.gov.uk/government/news/critical-minerals-lithium-partnership",
};
const rss=(category:string,link=url[category],pubdate="Fri, 09 Oct 2026 17:55:00 GMT",
  headline=title[category])=>
  category!=="macro"
    ? '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>'+headline+
      '</title><link rel="alternate" href="'+link+'"/>'+
      '<published>'+(Number.isFinite(Date.parse(pubdate))?
        new Date(pubdate).toISOString():pubdate)+
      '</published></entry></feed>'
    : '<rss version="2.0"><channel><item><title>'+headline+
      '</title><link>'+link+'</link><pubDate>'+pubdate+
      '</pubDate></item></channel></rss>';
const emptyRss='<rss version="2.0"><channel></channel></rss>';
const emptyAtom='<feed xmlns="http://www.w3.org/2005/Atom"></feed>';
const res=(body:string,type="application/rss+xml")=>
  new Response(body,{headers:{"content-type":type}});

describe("#1827 three-domain third publisher RSS/Atom strict private originals",()=>{
  it.each(["geopolitics","macro","rare_earth"])(
    "%s accepts ONLY original native-published current article, private/unlicensed",
    domain=>{
      const stats:Record<string,number>={};
      const rows=parseOfficialThirdRss(rss(domain),domain,{now,diagnostics:stats});
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        sourceDomain:OFFICIAL_NATIVE_THIRD_FEEDS[domain].host,
        publishedAt:"2026-10-09T17:55:00.000Z",
        nativeTimeEvidence:domain!=="macro"?"publisher_atom_entry_published":"publisher_rss_item_pubDate",
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

  it("gates UK FCDO Atom on native original published, never updated, forged host or future",()=>{
    const valid=parseOfficialThirdRss(rss("geopolitics"),"geopolitics",{now});
    expect(valid).toHaveLength(1);
    expect(valid[0].sourceDomain).toBe("www.gov.uk");
    expect(valid[0].nativeTimeEvidence).toBe("publisher_atom_entry_published");
    const future=rss("geopolitics",url.geopolitics,"Fri, 09 Oct 2026 18:12:00 GMT");
    expect(parseOfficialThirdRss(future,"geopolitics",{now})).toHaveLength(0);
    const forged=rss("geopolitics","https://www.gov.uk.evil.test/government/news/unsafe");
    expect(parseOfficialThirdRss(forged,"geopolitics",{now})).toHaveLength(0);
    const updatedOnly=rss("geopolitics")
      .replace("<published>2026-10-09T17:55:00.000Z</published>",
        "<updated>2026-10-09T17:55:00.000Z</updated>");
    expect(parseOfficialThirdRss(updatedOnly,"geopolitics",{now})).toHaveLength(0);
  });
  it("bounded same-original GOV.UK datePublished rescues only missing Atom publication",async()=>{
    const atom='<feed><entry><title>UK Foreign Secretary conflict and ceasefire statement</title>'+
      '<updated>2026-10-09T18:09:00Z</updated>'+
      '<link rel="alternate" href="'+url.geopolitics+'"/></entry></feed>';
    const fetched:string[]=[];
    const page="<html><head><meta property='article:published_time' "+
      "content='2026-10-09T17:55:00Z'/></head></html>";
    const fetchImpl=vi.fn(async(u:string,options:RequestInit)=>{
      fetched.push(u);
      expect(options.redirect).toBe("error");
      if(u===OFFICIAL_NATIVE_THIRD_FEEDS.geopolitics.url)
        return res(atom,"application/atom+xml");
      if(u===url.geopolitics)return res(page,"text/html");
      throw Error("NO_ARBITRARY_OFFICIAL_URL");
    });
    const counts:Record<string,number>={};
    const admitted=await fetchOfficialThirdPublisherArticles("geopolitics",{
      now,fetchImpl,diagnostics:counts,maxAgeMs:6*60*60*1000,
    });
    expect(fetched).toEqual([OFFICIAL_NATIVE_THIRD_FEEDS.geopolitics.url,url.geopolitics]);
    expect(admitted).toHaveLength(1);
    expect(admitted[0]).toMatchObject({privateOnly:true,commercialEligible:false,
      nativePublishedAtVerified:true,
      nativeTimeEvidence:"publisher_original_article_datePublished"});
    expect(counts.third_original_page_date_checks).toBe(1);
    expect(counts.third_original_page_date_admitted).toBe(1);
    const noDate=await fetchOfficialThirdPublisherArticles("geopolitics",{
      now,maxAgeMs:6*60*60*1000,
      fetchImpl:async(u:string)=>u===OFFICIAL_NATIVE_THIRD_FEEDS.geopolitics.url?
        res(atom,"application/atom+xml"):res("<html>no native time</html>","text/html"),
    });
    expect(noDate).toEqual([]);
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

  it("complete sampling retains earlier news and includes independent third publisher news",async()=>{
    const fetched:string[]=[];
    const feed='<rss><channel><item><title>Federal funds interest rate policy announcement</title>'+
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261009a.htm</link>'+
      '<pubDate>Fri, 09 Oct 2026 17:50:00 GMT</pubDate></item></channel></rss>';
    const diagnostics:Record<string,unknown>={};
    const rows=await fetchOfficialNativeArticles("macro",{now,sampleAllPublishers:true,diagnostics,
      fetchImpl:async(u:string)=>{
        fetched.push(u);
        if(u===OFFICIAL_NATIVE_FEEDS.macro.url)return res(feed);
        if(u===ORIGINAL_PUBLISHER_ALTERNATES.macro.url)return res(emptyAtom,"application/atom+xml");
        if(u===OFFICIAL_NATIVE_THIRD_FEEDS.macro.url)return res(rss("macro"));
        throw Error("UNEXPECTED_DESTINATION");
      }});
    expect(fetched).toHaveLength(3);
    expect(rows.map(row=>row.sourceDomain)).toEqual(["www.ecb.europa.eu","www.federalreserve.gov"]);
    expect(rows.every(row=>row.privateOnly && !row.rightsVerified && !row.commercialEligible)).toBe(true);
    expect(diagnostics.third_feed_attempted).toBe(true);
  });

  it("complete sampling preserves earlier originals when the third publisher denies access",async()=>{
    const diagnostics:Record<string,unknown>={};
    const feed='<rss><channel><item><title>Federal funds interest rate policy announcement</title>'+
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261009a.htm</link>'+
      '<pubDate>Fri, 09 Oct 2026 17:50:00 GMT</pubDate></item></channel></rss>';
    let thirdRequests=0;
    const rows=await fetchOfficialNativeArticles("macro",{now,sampleAllPublishers:true,diagnostics,
      fetchImpl:async(u:string)=>{
        if(u===OFFICIAL_NATIVE_FEEDS.macro.url)return res(feed);
        if(u===ORIGINAL_PUBLISHER_ALTERNATES.macro.url)return res(emptyAtom,"application/atom+xml");
        thirdRequests++;
        return new Response("not permitted",{status:403});
      }});
    expect(rows).toHaveLength(1);
    expect(thirdRequests).toBe(1);
    expect(diagnostics.third_feed_ok).toBe(false);
    expect(diagnostics.third_feed_failure_code).toBe("OFFICIAL_THIRD_HTTP_FORBIDDEN");
  });

  it("complete sampling deduplicates identical UN originals across the two primary feeds",async()=>{
    const original="https://news.un.org/en/story/2026/10/1234567";
    const feed='<rss><channel><item><title>Security Council calls for ceasefire in armed conflict</title>'+
      '<link>'+original+'</link><pubDate>Fri, 09 Oct 2026 17:50:00 GMT</pubDate></item></channel></rss>';
    const rows=await fetchOfficialNativeArticles("geopolitics",{now,sampleAllPublishers:true,
      fetchImpl:async(u:string)=>u===OFFICIAL_NATIVE_THIRD_FEEDS.geopolitics.url
        ?res(emptyAtom,"application/atom+xml"):res(feed)});
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(original);
  });

  it("minerals uses distinct UK DBT and recovers only original precise page dates",async()=>{
    const cfg=OFFICIAL_NATIVE_THIRD_FEEDS.rare_earth;
    expect(cfg.host).toBe("www.gov.uk");
    expect(cfg.url).toContain("department-for-business-and-trade.atom");
    const atom=rss("rare_earth").replace(/<published>.*?<\/published>/u,
      '<updated>2026-10-09T18:09:00Z</updated>');
    const urls:string[]=[];
    const rows=await fetchOfficialThirdPublisherArticles("rare_earth",{now,maxAgeMs:6*3600000,
      fetchImpl:async(u:string)=>{
        urls.push(u);
        if(u===cfg.url)return res(atom,"application/atom+xml");
        if(u===url.rare_earth)return res('<meta property="article:published_time" content="2026-10-09T17:55:00Z">',"text/html");
        throw Error("UNEXPECTED_DESTINATION");
      }});
    expect(urls).toEqual([cfg.url,url.rare_earth]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({sourceDomain:"www.gov.uk",privateOnly:true,
      rightsVerified:false,commercialEligible:false,publishedAt:"2026-10-09T17:55:00.000Z"});
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

  it.each([
    [403, "OFFICIAL_THIRD_HTTP_FORBIDDEN"],
    [404, "OFFICIAL_THIRD_HTTP_NOT_FOUND"],
    [503, "OFFICIAL_THIRD_HTTP_UPSTREAM_FAILURE"],
  ])("surfaces only bounded third-family HTTP %i diagnostics, no source URL/body leak",
    async(status,expectedCode)=>{
      const body="SENSITIVE_HTML_OR_ARTICLE_NOT_FOR_DIAGNOSTICS";
      const fetchImpl=vi.fn(async (u:string)=>{
        if(u===OFFICIAL_NATIVE_FEEDS.rare_earth.url)return res(emptyRss);
        if(u===ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url)
          return res(emptyAtom,"application/atom+xml");
        return new Response(body,{status,headers:{"content-type":"text/html"}});
      });
      const diagnostics:Record<string,unknown>={};
      const rows=await fetchOfficialNativeArticles("rare_earth",{
        now,fetchImpl,includeSecondPublisher:true,includeThirdPublisher:true,
        diagnostics,
      });
      expect(rows).toEqual([]);
      expect(diagnostics).toMatchObject({
        primary_feed_ok:true,alternate_feed_ok:true,
        third_feed_attempted:true,third_feed_ok:false,
        third_feed_failure_code:expectedCode,
      });
      const safe=JSON.stringify(diagnostics);
      expect(safe).not.toContain(body);
      expect(safe).not.toContain(OFFICIAL_NATIVE_THIRD_FEEDS.rare_earth.url);
      expect(safe).not.toContain("SENSITIVE_HTML");
      expect(safe).not.toContain("https://");
    },
  );

  it("distinguishes an official feed's wrong MIME from publisher HTTP/network failures",async()=>{
    const fetchImpl=vi.fn(async (u:string)=>{
      if(u===OFFICIAL_NATIVE_FEEDS.rare_earth.url)return res(emptyRss);
      if(u===ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url)
        return res(emptyAtom,"application/atom+xml");
      return res("<html>publisher login unavailable</html>","text/html");
    });
    const diagnostics:Record<string,unknown>={};
    const rows=await fetchOfficialNativeArticles("rare_earth",{
      now,fetchImpl,includeSecondPublisher:true,includeThirdPublisher:true,diagnostics,
    });
    expect(rows).toEqual([]);
    expect(diagnostics.third_feed_failure_code).toBe("OFFICIAL_THIRD_CONTENT_TYPE_INVALID");

    const throwNetwork=vi.fn(async (u:string)=>{
      if(u===OFFICIAL_NATIVE_FEEDS.macro.url)return res(emptyRss);
      if(u===ORIGINAL_PUBLISHER_ALTERNATES.macro.url)
        return res(emptyAtom,"application/atom+xml");
      throw new Error("CLOUDFLARE_AUTH_HTML_SENSITIVE_UPSTREAM_DETAILS");
    });
    const d:Record<string,unknown>={};
    const macro=await fetchOfficialNativeArticles("macro",{
      now,fetchImpl:throwNetwork,includeSecondPublisher:true,
      includeThirdPublisher:true,diagnostics:d,
    });
    expect(macro).toEqual([]);
    expect(d.third_feed_failure_code).toBe("ORIGINAL_FEED_NETWORK_UNAVAILABLE");
    expect(JSON.stringify(d)).not.toContain("SENSITIVE_UPSTREAM");
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
