import { describe, expect, it, vi } from "vitest";
import {
  verifiedPublisherPageDate,
  fetchVerifiedPublisherPageDate,
  ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN,
  SAFE_ORIGINAL_PAGE_DATE_REASONS,
} from "../../scripts/lib/official-original-article-date.mjs";
import { fetchOriginalAlternate } from "../../scripts/lib/official-native-alternates.mjs";
import {verifyCanadaOriginalDayEvidence} from "../../scripts/lib/official-original-day-evidence.mjs";

const now = new Date("2026-10-09T13:30:00Z");
const official = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals-supply-chain.html";
const statcan = "https://www150.statcan.gc.ca/n1/daily-quotidien/261009/dq261009a-eng.htm";
const subject = "Natural Resources Canada invests in lithium critical minerals mining resilience";
const xml = (urls: string[]) => [
  '<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-10-09T13:29:00Z</updated>',
  ...urls.map((url) => '<entry><title>' + subject + '</title><link rel="alternate" href="' +
    url + '"/><updated>2026-10-09T13:29:00Z</updated></entry>'),
  '</feed>',
].join("");
const page = (date: string) => [
  '<html><head><meta property="article:published_time" content="' + date + '">',
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","datePublished":"' + date + '"}</script>',
  '<meta property="article:modified_time" content="2026-10-09T13:29:00Z">',
  '</head><body>private original publisher page</body></html>',
].join("");

describe("explicit question-time history retains strict default original publication rules",()=>{
  it("verifies a dated historical original only with the caller's 31-day bound",()=>{
    const current=new Date("2026-10-14T12:00:00Z");
    const first='<meta name="govuk:first-published-at" content="2026-09-27T12:00:00+00:00">';
    expect(verifiedPublisherPageDate(first,current)).toBeNull();
    expect(verifiedPublisherPageDate(first,current,null,{maxAgeMs:31*86_400_000}))
      .toBe("2026-09-27T12:00:00.000Z");
    expect(verifiedPublisherPageDate(first,current,null,{maxAgeMs:7*86_400_000}))
      .toBeNull();
    const modified='<meta name="govuk:public-updated-at" content="2026-10-13T10:00:00Z">';
    expect(verifiedPublisherPageDate(modified,current,null,{maxAgeMs:31*86_400_000}))
      .toBeNull();
  });
});

describe("bounded original-publisher article precise-date fallback", () => {
  it("requires explicit precise publication time, not merely date or update time", () => {
    expect(verifiedPublisherPageDate(page("2026-10-09T12:45:00Z"), now))
      .toBe("2026-10-09T12:45:00.000Z");
    // The HTML closing tag permits whitespace before '>'; an earlier
    // regexp accepted only the exact spelling '</script>' and lost evidence.
    expect(verifiedPublisherPageDate(
      '<script type="application/ld+json">' +
      '{"@type":"NewsArticle","datePublished":"2026-10-09T12:45:00Z"}' +
      '</script >', now,
    )).toBe("2026-10-09T12:45:00.000Z");
    expect(verifiedPublisherPageDate(
      '<script type="application/ld+json">' +
      '{"@type":"NewsArticle","datePublished":"2026-10-09T12:45:00Z"}' +
      '</SCRIPT  \t>', now,
    )).toBe("2026-10-09T12:45:00.000Z");
    expect(verifiedPublisherPageDate(
      '<script type="application/ld+json">' +
      '{"@type":"NewsArticle","datePublished":"2026-10-09T12:45:00Z"}' +
      '</script-x>', now,
    )).toBeNull();
    expect(verifiedPublisherPageDate('<meta property="article:published_time" content="2026-10-09T12:45:00+00:00">', now))
      .toBe("2026-10-09T12:45:00.000Z");
    expect(verifiedPublisherPageDate('<meta property="article:modified_time" content="2026-10-09T12:00:00Z">', now)).toBeNull();
    expect(verifiedPublisherPageDate('<script type="application/ld+json">{"@type":"NewsArticle","dateModified":"2026-10-09T12:00:00Z"}</script>', now)).toBeNull();
    expect(verifiedPublisherPageDate(page("2026-10-09"), now)).toBeNull();
    expect(verifiedPublisherPageDate(page("2026-10-09T13:32:00Z"), now)).toBeNull();
    expect(verifiedPublisherPageDate(page("2026-10-07T12:45:00Z"), now)).toBeNull();
    expect(verifiedPublisherPageDate(
      '<meta property="article:published_time" content="2026-10-09T12:45:00Z">' +
      '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-09T13:00:00Z"}</script>', now))
      .toBeNull();
  });


  it("diagnoses missing, day-only, stale, future and conflicting ORIGINAL publisher clocks privately",async()=>{
    const scenarios=[
      {html:'<html><meta name="govuk:updated-at" content="2026-10-09T13:00:00Z"></html>',
       reason:"MISSING_PUBLISHER_PUBLICATION_METADATA",accepted:false},
      {html:page("2026-10-09"),reason:"IMPRECISE_DATE_ONLY",accepted:false},
      {html:page("not-an-original-clock"),reason:"INVALID_PUBLICATION_DATE_SHAPE",accepted:false},
      {html:page("2026-10-09T13:32:00Z"),reason:"FUTURE_PUBLISHER_PUBLICATION",accepted:false},
      {html:page("2026-10-07T12:45:00Z"),reason:"STALE_PUBLISHER_PUBLICATION",accepted:false},
      {html:'<meta property="article:published_time" content="2026-10-09T12:45:00Z">'+
         '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-09T13:00:00Z"}</script>',
       reason:"CONFLICTING_PUBLISHER_PUBLICATION",accepted:false},
      {html:page("2026-10-09T12:45:00Z"),
       reason:"PRECISE_PUBLICATION_ACCEPTED",accepted:true},
    ] as const;
    expect(SAFE_ORIGINAL_PAGE_DATE_REASONS).toHaveLength(7);
    for(const row of scenarios){
      const diagnostics:{code?:string;date_reason?:string}={};
      const nowResult=verifiedPublisherPageDate(row.html,now,diagnostics);
      expect(nowResult!==null).toBe(row.accepted);
      expect(diagnostics.date_reason).toBe(row.reason);
      const fetchImpl=vi.fn(async()=>new Response(row.html,{
        headers:{"content-type":"text/html"},
      }));
      const networkResult=await fetchVerifiedPublisherPageDate(official,"rare_earth",{
        now,fetchImpl,diagnostics,
      });
      expect(networkResult).toBe(nowResult);
      expect(diagnostics.date_reason).toBe(row.reason);
      expect(diagnostics.code).toBe(row.accepted
        ?"PRECISE_PUBLICATION_VERIFIED":"PRECISE_PUBLICATION_UNVERIFIED");
      // Never send the opaque original URL, body or actual timestamp into codes.
      expect(JSON.stringify(diagnostics)).not.toContain("www.canada.ca");
      expect(JSON.stringify(diagnostics)).not.toContain("private original");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });


  it("accepts explicitly zoned ISO author-time microseconds and compact offsets without inventing time",async()=>{
    const approved=[
      ["2026-10-09T12:45:00.123456Z","2026-10-09T12:45:00.123Z"],
      ["2026-10-09T12:45:00.123456789+0000","2026-10-09T12:45:00.123Z"],
      ["2026-10-09T18:15:00.123456+0530","2026-10-09T12:45:00.123Z"],
      ["2026-10-09T12:45:00+0000","2026-10-09T12:45:00.000Z"],
      ["2026-10-09T12:45:00+00:00","2026-10-09T12:45:00.000Z"],
    ] as const;
    for(const [raw,expected] of approved){
      const diagnostic:Record<string,unknown>={};
      expect(verifiedPublisherPageDate(page(raw),now,diagnostic)).toBe(expected);
      expect(diagnostic.date_reason).toBe("PRECISE_PUBLICATION_ACCEPTED");
      const fetchImpl=vi.fn(async()=>new Response(page(raw),{
        headers:{"content-type":"text/html"},
      }));
      expect(await fetchVerifiedPublisherPageDate(official,"rare_earth",{
        now,fetchImpl,diagnostics:diagnostic,
      })).toBe(expected);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(diagnostic.code).toBe("PRECISE_PUBLICATION_VERIFIED");
    }
    // These require impossible/guessed clocks or are past the 24h window.
    for(const bad of [
      "2026-10-09","2026-10-09T12:45:00",
      "2026-10-09T12:45:00.1234567890Z",
      "2026-10-09T12:45:00+1401",
      "2026-10-09T12:45:00-2515",
      "2026-02-30T12:45:00Z",
      "2026-10-09T13:32:00Z",
      "2026-10-07T12:45:00Z",
    ])expect(verifiedPublisherPageDate(page(bad),now)).toBeNull();
    const contradictions=
      '<meta property="article:published_time" content="2026-10-09T12:45:00.123456Z">'+
      '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-09T12:55:00+0000"}</script>';
    expect(verifiedPublisherPageDate(contradictions,now)).toBeNull();
    expect(verifiedPublisherPageDate(
      '<meta property="article:modified_time" content="2026-10-09T12:45:00.123456Z">',
      now)).toBeNull();
  });

  it("rejects unrelated URLs and never follows cross-origin redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(page("2026-10-09T12:45:00Z"), {
      headers: { "content-type": "text/html" },
    }));
    for (const url of [
      "http://www.canada.ca/en/natural-resources-canada/news/abc",
      "https://www.canada.ca.evil.example/en/natural-resources-canada/news/abc",
      "https://www.canada.ca/en/other-agency/news/abc",
      statcan,
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html?redirect=https://evil.test",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/%2F%2Fevil.html",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/fake.html#fragment",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/../../../evil.html",
      "https://natural-resources.canada.ca/other/news/2026/example.html",
    ]) {
      expect(await fetchVerifiedPublisherPageDate(url, "rare_earth", { now, fetchImpl })).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await fetchVerifiedPublisherPageDate(statcan, "macro", { now, fetchImpl }))
      .toBe("2026-10-09T12:45:00.000Z");
    expect(fetchImpl.mock.calls[0][0]).toBe(statcan);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).redirect).toBe("error");

  });

  it("returns closed publication-page failure codes without revealing URL/body or promoting updates",async()=>{
    const cases:[string,(url:string,options:RequestInit)=>Promise<Response>][]=[
      ["NETWORK_OR_REDIRECT_DENIED",async()=>{throw Error("sensitive token and original page body");}],
      ["HTTP_UNAUTHORIZED",async()=>new Response("private forbidden response",{status:403})],
      ["HTTP_RATE_LIMITED",async()=>new Response("private throttled response",{status:429})],
      ["HTTP_NOT_OK",async()=>new Response("not found",{status:404})],
      ["MIME_NOT_HTML",async()=>new Response("sensitive",{headers:{"content-type":"application/json"}})],
      ["BODY_TOO_LARGE",async()=>new Response("private html",{headers:{
        "content-type":"text/html","content-length":"400000",
      }})],
      ["PRECISE_PUBLICATION_UNVERIFIED",async()=>new Response(
        '<html><meta property="article:modified_time" content="2026-10-09T13:00:00Z"></html>',{
          headers:{"content-type":"text/html"},
        })],
    ];
    for(const [code,fetchImpl] of cases){
      const diagnostics:Record<string,unknown>={};
      const result=await fetchVerifiedPublisherPageDate(statcan,"macro",{
        now,fetchImpl,diagnostics,
      });
      expect(result).toBeNull();
      expect(diagnostics).toEqual(code==="PRECISE_PUBLICATION_UNVERIFIED"
        ?{code,date_reason:"MISSING_PUBLISHER_PUBLICATION_METADATA"}:{code});
      expect(JSON.stringify(diagnostics)).not.toContain("sensitive");
      expect(JSON.stringify(diagnostics)).not.toContain("statcan");
    }
    const verified:Record<string,unknown>={};
    expect(await fetchVerifiedPublisherPageDate(statcan,"macro",{
      now,fetchImpl:async()=>new Response(page("2026-10-09T12:45:00Z"),{
        headers:{"content-type":"text/html"},
      }),diagnostics:verified,
    })).toBe("2026-10-09T12:45:00.000Z");
    expect(verified).toEqual({code:"PRECISE_PUBLICATION_VERIFIED",
      date_reason:"PRECISE_PUBLICATION_ACCEPTED"});
    const denied:Record<string,unknown>={};
    expect(await fetchVerifiedPublisherPageDate(
      "https://evil.example/n1/daily-quotidien/261009/abc.htm",
      "macro",{now,diagnostics:denied,fetchImpl:async()=>{throw Error("should not fetch");}},
    )).toBeNull();
    expect(denied).toEqual({code:"URL_UNAPPROVED"});
  });

  it("restricts UK, Fed and USGS HTML date fallbacks to fixed first-party article paths",async()=>{
    const valid=[
      ["geopolitics","https://www.gov.uk/government/news/uk-foreign-policy-security-statement"],
      ["macro","https://www.federalreserve.gov/newsevents/pressreleases/monetary20261009a.htm"],
      ["rare_earth","https://www.usgs.gov/news/national-news-release/critical-minerals-supply-chain"],
    ] as const;
    const timestamp="2026-10-09T12:45:00Z";
    const fetchImpl=vi.fn(async(url:string,opts:RequestInit)=>{
      expect(valid.some(([,value])=>value===url)).toBe(true);
      expect(opts.redirect).toBe("error");
      return new Response(page(timestamp),{headers:{"content-type":"text/html"}});
    });
    for(const [domain,url] of valid){
      expect(await fetchVerifiedPublisherPageDate(url,domain,{
        now,fetchImpl,
      })).toBe("2026-10-09T12:45:00.000Z");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for(const [domain,url] of valid){
      for(const attempted of [
        url.replace("https://","http://"),
        url.replace("https://www.","https://www.evil."),
        url+"?forward=https://evil.example",
        url+"#section",
      ]){
        expect(await fetchVerifiedPublisherPageDate(attempted,domain,{
          now,fetchImpl,
        })).toBeNull();
      }
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // GOV.UK original article paths are shared by the existing Treasury,
    // FCDO and DBT lanes; a category does not certify department or relevance.
    expect(await fetchVerifiedPublisherPageDate(valid[0][1],"macro",{
      now,fetchImpl,
    })).toBe("2026-10-09T12:45:00.000Z");
    for(const [domain,url] of valid.slice(1)){
      expect(await fetchVerifiedPublisherPageDate(url,"macro"===domain
        ?"rare_earth":"macro",{now,fetchImpl})).toBeNull();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("uses a maximum two original publisher pages; outputs only private derived evidence", async () => {
    const third = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/third-project.html";
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => new Response(xml([official, third, official + "?p=4"]), {
        headers: { "content-type": "application/atom+xml" },
      }))
      .mockImplementation(async () => new Response(page("2026-10-09T12:45:00Z"), {
        headers: { "content-type": "text/html" },
      }));
    const d: Record<string, number> = {};
    const rows = await fetchOriginalAlternate("rare_earth", { now, fetchImpl, diagnostics: d });
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1 + ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN);
    expect(d.alternate_native_date_items).toBe(0);
    expect(d.alternate_atom_updated_only_items).toBe(3);
    expect(d.alternate_article_page_probes).toBe(2);
    expect(d.alternate_article_page_admitted).toBe(2);
    expect(rows[0]).toMatchObject({
      discoveryProvider: "official_native_rss",
      nativeTimeEvidence: "publisher_original_article_datePublished",
      nativePublishedAtVerified: true,
      privateOnly: true, rightsVerified: false, commercialEligible: false,
      publishedAt: "2026-10-09T12:45:00.000Z",
    });
    expect(rows[0]).not.toHaveProperty("severity");
    expect(JSON.stringify(d)).not.toContain("www.canada.ca");
    expect(JSON.stringify(d)).not.toContain(subject);
  });

  it("never admits a government article with only modified/update date", async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => new Response(xml([official]), {
        headers: { "content-type": "application/atom+xml" },
      }))
      .mockImplementationOnce(async () => new Response(
        '<html><meta property="article:modified_time" content="2026-10-09T13:20:00Z"></html>', {
          headers: { "content-type": "text/html" },
        }));
    const d: Record<string, number> = {};
    expect(await fetchOriginalAlternate("rare_earth", { now, fetchImpl, diagnostics: d }))
      .toEqual([]);
    expect(d.alternate_article_page_probes).toBe(1);
    expect(d.alternate_article_page_admitted).toBe(0);
  });
});

describe("#2041 first-party Canada/StatCan day-precision original without invented clock",()=>{
  const at=new Date("2026-10-24T14:00:00Z");
  const canadian="https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals-project.html";
  const stats="https://www150.statcan.gc.ca/n1/daily-quotidien/261023/dq261023a-eng.htm";
  const valid='<html><head><meta name="dcterms.issued" content="2026-10-23"></head>'+
    '<body>Natural Resources Canada official article</body></html>';
  it("retains original day as coarse date only, never exact signed time",async()=>{
    expect(verifyCanadaOriginalDayEvidence({articleUrl:canadian,html:valid,now:at}))
      .toMatchObject({publication_day:"2026-10-23",precision:"day",
        verified_precise_publication_instant:false,
        commercial_rights_verified:false,independently_signed:false,chargeable:false});
    expect(verifiedPublisherPageDate(valid,at)).toBeNull();
    const d:Record<string,unknown>={};
    expect(await fetchVerifiedPublisherPageDate(canadian,"rare_earth",{
      now:at,diagnostics:d,allowCanadaDayObservation:true,
      fetchImpl:async()=>new Response(valid,{headers:{"content-type":"text/html"}}),
    })).toBeNull();
    expect(d.original_day_precision_verified).toBe(true);
    expect(d.code).toBe("PRECISE_PUBLICATION_UNVERIFIED");
    expect(JSON.stringify(d)).not.toContain("2026-10-23");
  });
  it("verifies StatCan daily source-native article date against exact path",()=>{
    const html='<meta name="dcterms.issued" content="2026-10-23">';
    expect(verifyCanadaOriginalDayEvidence({articleUrl:stats,html,now:at}))
      ?.publication_day).toBe("2026-10-23");
    expect(verifyCanadaOriginalDayEvidence({articleUrl:stats,
      html:html.replace("2026-10-23","2026-10-22"),now:at})).toBeNull();
  });
  it("rejects modified only, missing, conflicting, future, stale, forged URLs",()=>{
    for(const html of [
      '<meta name="dcterms.modified" content="2026-10-23">',
      '<meta property="article:modified_time" content="2026-10-23">',
      '<meta name="dcterms.issued" content="2026-10-23">'+
        '<meta name="datePublished" content="2026-10-22">',
      '<meta name="dcterms.issued" content="2026-10-25">',
      '<meta name="dcterms.issued" content="2026-02-30">',
    ])expect(verifyCanadaOriginalDayEvidence({articleUrl:canadian,html,now:at})).toBeNull();
    for(const url of [
      "https://www.canada.ca.evil.example/en/natural-resources-canada/news/2026/10/critical-minerals-project.html",
      canadian+"?next=https://evil.example",
      canadian.replace("https://","http://"),
      "https://www.canada.ca/en/other-agency/news/2026/10/critical-minerals-project.html",
    ])expect(verifyCanadaOriginalDayEvidence({articleUrl:url,html:valid,now:at})).toBeNull();
    expect(verifyCanadaOriginalDayEvidence({articleUrl:canadian,html:valid,
      now:new Date("2026-11-03T14:00:00Z")})).toBeNull();
  });
  it("does not add day evidence unless explicitly opted into private observer",async()=>{
    const d:Record<string,unknown>={};
    await fetchVerifiedPublisherPageDate(canadian,"rare_earth",{
      now:at,diagnostics:d,
      fetchImpl:async()=>new Response(valid,{headers:{"content-type":"text/html"}}),
    });
    expect(d.original_day_precision_verified).toBeUndefined();
    expect(d.code).toBe("PRECISE_PUBLICATION_UNVERIFIED");
  });
});
