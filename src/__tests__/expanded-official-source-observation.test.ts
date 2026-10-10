import { describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  EXPANDED_OFFICIAL_SOURCES,
  probeExpandedOfficialMesh,
  probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";

const now=new Date("2026-10-10T07:00:00.000Z");
const xml=`<rss version="2.0"><channel>
  <lastBuildDate>Sat, 10 Oct 2026 06:59:00 GMT</lastBuildDate>
  <item><title>European Commission critical raw materials strategic projects</title>
    <pubDate>Sat, 10 Oct 2026 06:00:00 GMT</pubDate></item>
  <item><title>Old ECB/statistical notice</title>
    <pubDate>Wed, 07 Oct 2026 06:00:00 GMT</pubDate></item>
  <item><title>Future not evidence</title>
    <pubDate>Sun, 11 Oct 2026 06:00:00 GMT</pubDate></item>
  <item><title>Undated is not an event</title></item>
</channel></rss>`;
const response=(body:string,type:string)=>new Response(body,{headers:{"content-type":type}});
const atomCanada="<feed xmlns=\"http://www.w3.org/2005/Atom\"><updated>2026-10-10T06:59:00Z</updated>\n  <entry><title>Critical minerals and consumer prices inflation update from government</title>\n  <published>2026-10-10T06:05:00Z</published>\n  <updated>2026-10-10T06:59:00Z</updated>\n  <link rel=\"alternate\" href=\"https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals-update.html\" />\n  </entry></feed>";
const atomUk=`<feed><entry><title>Routine government notice</title><published>2026-10-10T06:25:00Z</published><link rel="alternate" href="https://www.gov.uk/government/news/routine-notice"/></entry></feed>`;
const atomStatcan="<feed xmlns=\"http://www.w3.org/2005/Atom\"><updated>2026-10-10T06:59:00Z</updated>\n  <entry><title>Consumer price index inflation and industrial product price update</title>\n  <published>2026-10-10T06:05:00Z</published>\n  <link rel=\"alternate\" href=\"https://www150.statcan.gc.ca/n1/daily-quotidien/261010/dq261010a-eng.htm\" />\n  </entry></feed>";
describe("#1827 expanded official three-domain private observation lane",()=>{
  it("has twelve fixed publisher observations and exactly three domains",()=>{
    expect(EXPANDED_OFFICIAL_SOURCES.map((s:any)=>s.domain))
      .toEqual(["geopolitics","macro","macro","rare_earth","rare_earth","rare_earth","geopolitics","macro","rare_earth","geopolitics","macro","rare_earth"]);
    for(const s of EXPANDED_OFFICIAL_SOURCES){
      expect(new URL(s.url).protocol).toBe("https:");
      expect(s.rights).toBe("UNVERIFIED");
      expect(s.event_intelligence).toBe(false);
      expect(s.country_coverage_verified).toBe(false);
      expect(["six_hourly","ninety_minutes"]).toContain(s.poll);
    }
    expect(EXPANDED_OFFICIAL_SOURCES[2].alternate_url)
      .toBe("https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/de/statistics-update.rss");
    expect(EXPANDED_OFFICIAL_SOURCES.filter((s:any)=>s.alternate_url)).toHaveLength(1);
    expect(EXPANDED_OFFICIAL_SOURCES.map((s:any)=>new URL(s.url).host))
      .toEqual(["finance.ec.europa.eu","www.ecb.europa.eu","ec.europa.eu","eiti.org","european-union.europa.eu","natural-resources.canada.ca","news.un.org","www150.statcan.gc.ca","api.io.canada.ca","www.gov.uk","www.federalreserve.gov","www.usgs.gov"]);
  });
  it("samples only fixed official sources; release dates cannot prove scored current events",async()=>{
    const seen:string[]=[];
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      seen.push(url);
      expect(options.redirect).toBe("error");
      expect(options.credentials).toBeUndefined();
      if(new URL(url).hostname === "eiti.org")
        return response(JSON.stringify({data:[{id:1,year:2024}]}),"application/json");
      if(url.includes("www150.statcan.gc.ca"))return response(atomStatcan,"application/atom+xml");
      if(url.includes("api.io.canada.ca"))return response(atomCanada,"application/atom+xml");
      if(new URL(url).hostname === "www.gov.uk")return response(atomUk,"application/atom+xml");
      return response(xml,"application/rss+xml");
    });
    const res=await probeExpandedOfficialMesh({fetchImpl,now});
    expect(fetchImpl).toHaveBeenCalledTimes(12);
    expect(seen).toEqual(EXPANDED_OFFICIAL_SOURCES.map((s:any)=>s.url));
    expect(res.status).toBe("SOURCE_TRANSPORT_OBSERVED");
    for(const x of res.sources){
      expect(x.publisher_reachable).toBe(true);
      expect(x.format_valid).toBe(true);
      expect(x.commercial_eligible).toBe(false);
      expect(x.current_scored_intelligence_verified).toBe(false);
      expect(x.country_coverage_verified).toBe(false);
    }
    expect(res.sources[0].source_native_release_items).toBe(2);
    expect(res.sources[0].source_native_24h_release_items).toBe(1);
    expect(res.sources[3].source_native_24h_release_items).toBeNull();
    expect(res.sources[5].source_native_24h_release_items).toBe(1);
    expect(res.sources[4].topical_private_release_links_24h).toBe(1);
    expect(res.sources[4].same_event_independent_corroboration_verified).toBe(false);
    expect(res.sources[7].topical_private_release_links_24h).toBe(1);
    expect(res.sources[8].topical_private_release_links_24h).toBe(1);
    expect(res.original_publisher_native_24h_topic_counts).toEqual({
      geopolitics:0,macro:1,rare_earth:1,
    });
    expect(res.original_publisher_freshness_windows).toEqual({
      geopolitics:{within_90m:0,within_6h:0,within_24h:0,original_publisher_transport_healthy:true},
      macro:{within_90m:1,within_6h:1,within_24h:1,original_publisher_transport_healthy:true},
      rare_earth:{within_90m:1,within_6h:1,within_24h:1,original_publisher_transport_healthy:true},
    });
    expect(res.independent_original_origin_lanes).toEqual({
      geopolitics:{
        organizations_with_6h_originals:0,
        organizations_with_90m_originals:0,
        possible_two_independent_origins_in_6h:false,
        same_event_independent_corroboration_verified:false,
        source_rights_verified:false,
        current_scored_intelligence_verified:false,commercial_eligible:false,
      },
      macro:{
        organizations_with_6h_originals:1,
        organizations_with_90m_originals:1,
        possible_two_independent_origins_in_6h:false,
        same_event_independent_corroboration_verified:false,
        source_rights_verified:false,
        current_scored_intelligence_verified:false,commercial_eligible:false,
      },
      rare_earth:{
        organizations_with_6h_originals:1,
        organizations_with_90m_originals:1,
        possible_two_independent_origins_in_6h:false,
        same_event_independent_corroboration_verified:false,
        source_rights_verified:false,
        current_scored_intelligence_verified:false,commercial_eligible:false,
      },
    });
    expect(res.verified_country_count).toBe(0);
    expect(res.verified_current_event_domains).toBe(0);
    expect(res.globally_current_scored_coverage_verified).toBe(false);
    expect(res.supabase_writes).toBe(0);
    expect(res.b2_requests).toBe(0);
    expect(res.payment_performed).toBe(false);
    expect(JSON.stringify(res)).not.toContain("EU policy notice");
  });
  it("rejects wrong mime, denied publisher, network failures and invalid structural JSON",async()=>{
    const eu=EXPANDED_OFFICIAL_SOURCES[0];
    const eiti=EXPANDED_OFFICIAL_SOURCES[3];
    const cases=[
      {source:eu,reply:async()=>{throw Error("sensitive upstream token");},reason:"TRANSPORT_UNAVAILABLE"},
      {source:eu,reply:async()=>new Response("private",{status:403}),reason:"PUBLISHER_DENIED"},
      {source:eu,reply:async()=>response("<html>sensitive</html>","text/html"),reason:"SOURCE_CONTENT_TYPE_INVALID"},
      {source:eu,reply:async()=>response("<rss><!DOCTYPE secret><item/></rss>","application/rss+xml"),reason:"SOURCE_SHAPE_UNVERIFIED"},
      {source:eiti,reply:async()=>response("null","application/json"),reason:"SOURCE_SHAPE_UNVERIFIED"},
      {source:eiti,reply:async()=>response("{broken","application/json"),reason:"SOURCE_SHAPE_UNVERIFIED"},
      {source:eiti,reply:async()=>new Response("{}",{headers:{
        "content-type":"application/json","content-length":"9999999",
      }}),reason:"SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE"},
    ];
    for(const c of cases){
      const x=await probeExpandedSource(c.source,{fetchImpl:c.reply,now});
      expect(x.reason).toBe(c.reason);
      expect(x.format_valid).toBe(false);
      expect(x.commercial_eligible).toBe(false);
      expect(JSON.stringify(x)).not.toContain("private forbidden response");
      expect(JSON.stringify(x)).not.toContain("secret");
      expect(JSON.stringify(x)).not.toContain("sensitive");
    }
  });
  it("counts only documented Eurostat native dataset-data update categories, not all 24h catalog items",async()=>{
    const e=EXPANDED_OFFICIAL_SOURCES[2];
    const changeXml='<rss><channel>'+
      ['UPDATED_DATASET_DATA','UPDATED_DATASET_STRUCTURE_DATA','UPDATED_DATASET_STRUCTURE','NEW_CODE_LIST','DELETED_DATASET']
      .map((kind,i)=>'<item><title>Eurostat catalogue '+i+'</title><category>'+kind+'</category>'+
        '<pubDate>Sat, 10 Oct 2026 06:00:00 GMT</pubDate></item>').join("")+
      '<item><title>Future fake data update</title><category>UPDATED_DATASET_DATA</category>'+
        '<pubDate>Sun, 11 Oct 2026 06:00:00 GMT</pubDate></item>'+
      '<item><title>Undated fake data update</title><category>UPDATED_DATASET_DATA</category></item>'+
      '<item><title>Old data release</title><category>UPDATED_DATASET_DATA</category>'+
        '<pubDate>Wed, 07 Oct 2026 06:00:00 GMT</pubDate></item>'+
      '</channel></rss>';
    const result=await probeExpandedSource(e,{now,
      fetchImpl:async()=>response(changeXml,"application/rss+xml")});
    expect(result.format_valid).toBe(true);
    expect(result.source_native_24h_release_items).toBe(5);
    expect(result.eurostat_native_dataset_data_updates_24h).toBe(2);
    expect(result.eurostat_other_catalogue_changes_24h).toBe(3);
    expect(result.current_scored_intelligence_verified).toBe(false);
    expect(result.commercial_eligible).toBe(false);
    // Only the original Eurostat catalogue can receive this typed field;
    // generic release/press RSS cannot masquerade as Eurostat data updates.
    const fake=await probeExpandedSource(EXPANDED_OFFICIAL_SOURCES[1],{
      now,fetchImpl:async()=>response(changeXml,"application/rss+xml")});
    expect(fake.eurostat_native_dataset_data_updates_24h).toBeNull();
    expect(fake.eurostat_other_catalogue_changes_24h).toBeNull();
  });
  it("recovers Eurostat HTTP 406 content negotiation without bypassing RSS MIME and commercial gates",async()=>{
    const source=EXPANDED_OFFICIAL_SOURCES[2];
    const seen:string[]=[];
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      seen.push(url);
      const accept=(options.headers as Record<string,string>).accept;
      return accept==="*/*"
        ?response(xml,"application/xml")
        :new Response("Not Acceptable",{status:406});
    });
    const result=await probeExpandedSource(source,{now,fetchImpl});
    expect(seen).toEqual([source.url]);
    expect(result.primary_http_status).toBe(200);
    expect(result.official_locale_fallback_attempted).toBe(false);
    expect(result.format_valid).toBe(true);
    expect(result.source_native_24h_release_items).toBe(1);
    expect(result.same_event_independent_corroboration_verified).toBe(false);
    expect(result.commercial_rights_verified).toBe(false);
    expect(result.current_scored_intelligence_verified).toBe(false);
    expect(result.commercial_eligible).toBe(false);
    // HTML must still be blocked, even with permissive Accept header.
    const wrongMime=await probeExpandedSource(source,{
      now,fetchImpl:async()=>response("<html>sensitive</html>","text/html"),
    });
    expect(wrongMime.reason).toBe("SOURCE_CONTENT_TYPE_INVALID");
    expect(wrongMime.format_valid).toBe(false);
  });
  it("enforces a larger yet strictly finite Eurostat-only RSS body limit",async()=>{
    const eurostat=EXPANDED_OFFICIAL_SOURCES[2];
    const ecb=EXPANDED_OFFICIAL_SOURCES[1];
    const largeXml='<rss><channel><item><title>Data catalogue update</title>'+
      '<pubDate>Sat, 10 Oct 2026 06:00:00 GMT</pubDate></item>'+
      '<!--'+ 'a'.repeat(200*1024)+'--></channel></rss>';
    const fetchImpl=async()=>response(largeXml,"application/xml");
    const eur=await probeExpandedSource(eurostat,{now,fetchImpl});
    expect(eur.format_valid).toBe(true);
    expect(eur.source_native_24h_release_items).toBe(1);
    expect(eur.commercial_eligible).toBe(false);
    const other=await probeExpandedSource(ecb,{now,fetchImpl});
    expect(other.reason).toBe("SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE");
    expect(other.format_valid).toBe(false);
    const tooLarge='<rss><channel><!--'+'x'.repeat(1024*1024)+'</channel></rss>';
    const oversized=await probeExpandedSource(eurostat,{
      now,fetchImpl:async()=>response(tooLarge,"application/xml"),
    });
    expect(oversized.reason).toBe("SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE");
    expect(oversized.commercial_eligible).toBe(false);
  });
  it("uses a single same-publisher Eurostat locale fallback for HTTP 404/5xx, without commercial promotion",async()=>{
    const source=EXPANDED_OFFICIAL_SOURCES[2];
    for(const primaryStatus of [404,503]){
      const seen:string[]=[];
      const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
        seen.push(url);
        expect(options.redirect).toBe("error");
        return seen.length===1
          ?new Response("server unavailable",{status:primaryStatus})
          :response(xml,"application/rss+xml");
      });
      const result=await probeExpandedSource(source,{now,fetchImpl});
      expect(seen).toEqual([source.url,source.alternate_url]);
      expect(result.format_valid).toBe(true);
      expect(result.official_locale_fallback_attempted).toBe(true);
      expect(result.official_locale_fallback_used).toBe(true);
      expect(result.primary_http_status).toBe(primaryStatus);
      expect(result.fallback_http_status).toBe(200);
      expect(result.source_native_24h_release_items).toBe(1);
      expect(result.same_event_independent_corroboration_verified).toBe(false);
      expect(result.current_scored_intelligence_verified).toBe(false);
      expect(result.commercial_rights_verified).toBe(false);
      expect(result.commercial_eligible).toBe(false);
    }
  });
  it("does not evade denial, rate-limits, transport failure or invalid fallback body",async()=>{
    const source=EXPANDED_OFFICIAL_SOURCES[2];
    for(const status of [401,403,429]){
      const fetchImpl=vi.fn(async()=>new Response("denied private content",{status}));
      const result=await probeExpandedSource(source,{now,fetchImpl});
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(result.official_locale_fallback_attempted).toBe(false);
      expect(result.primary_http_status).toBe(status);
      expect(result.fallback_http_status).toBeNull();
      expect(result.format_valid).toBe(false);
      expect(result.commercial_eligible).toBe(false);
      expect(JSON.stringify(result)).not.toContain("denied private content");
    }
    const redirect=vi.fn(async()=>{throw Error("redirect blocked sensitive upstream");});
    const denied=await probeExpandedSource(source,{now,fetchImpl:redirect});
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(denied.reason).toBe("TRANSPORT_UNAVAILABLE");
    const badFallback=vi.fn(async()=>badFallback.mock.calls.length===1
      ?new Response("down",{status:503})
      :response("<html>not xml</html>","text/html"));
    const degraded=await probeExpandedSource(source,{now,fetchImpl:badFallback});
    expect(badFallback).toHaveBeenCalledTimes(2);
    expect(degraded.official_locale_fallback_attempted).toBe(true);
    expect(degraded.official_locale_fallback_used).toBe(false);
    expect(degraded.primary_http_status).toBe(503);
    expect(degraded.fallback_http_status).toBe(200);
    expect(degraded.format_valid).toBe(false);
    expect(degraded.commercial_eligible).toBe(false);
  });
  it("continues all other domains when one external publisher is offline",async()=>{
    const res=await probeExpandedOfficialMesh({now,fetchImpl:async(url:string)=>{
      if(url.includes("ecb.europa.eu"))throw Error("down");
      if(new URL(url).hostname === "eiti.org")return response('{"data":[]}',"application/json");
      if(url.includes("www150.statcan.gc.ca"))return response(atomStatcan,"application/atom+xml");
      if(url.includes("api.io.canada.ca"))return response(atomCanada,"application/atom+xml");
      if(new URL(url).hostname === "www.gov.uk")return response(atomUk,"application/atom+xml");
      return response(xml,"application/rss+xml");
    }});
    expect(res.status).toBe("SOURCE_TRANSPORT_DEGRADED");
    expect(res.sources.map((x:any)=>x.publisher_reachable)).toEqual([true,false,true,true,true,true,true,true,true,true,true,true]);
    expect(res.globally_current_scored_coverage_verified).toBe(false);
    expect(res.commercial_eligible).toBe(false);
  });

  it("accepts only native Atom published and exact government original publisher hosts",async()=>{
    const macro=EXPANDED_OFFICIAL_SOURCES[7],minerals=EXPANDED_OFFICIAL_SOURCES[8];
    const goodM=await probeExpandedSource(macro,{now,fetchImpl:async()=>response(atomStatcan,"application/atom+xml")});
    const goodR=await probeExpandedSource(minerals,{now,fetchImpl:async()=>response(atomCanada,"application/atom+xml")});
    for(const row of [goodM,goodR]){
      expect(row.format_valid).toBe(true);
      expect(row.source_native_release_items).toBe(1);
      expect(row.source_native_24h_release_items).toBe(1);
      expect(row.topical_private_release_links_24h).toBe(1);
      expect(row.commercial_rights_verified).toBe(false);
      expect(row.commercial_eligible).toBe(false);
    }
    const updatedOnly=atomCanada.replace("<published>2026-10-10T06:05:00Z</published>","");
    const noPublication=await probeExpandedSource(minerals,{now,fetchImpl:async()=>response(updatedOnly,"application/atom+xml")});
    expect(noPublication.format_valid).toBe(true);
    expect(noPublication.source_native_24h_release_items).toBe(0);
    expect(noPublication.topical_private_release_links_24h).toBe(0);
    const future=atomCanada.replace("2026-10-10T06:05:00Z","2026-10-11T06:05:00Z");
    expect((await probeExpandedSource(minerals,{now,fetchImpl:async()=>response(future,"application/atom+xml")}))
      .source_native_24h_release_items).toBe(0);
    const evil=atomCanada.replace("https://www.canada.ca/","https://www.canada.ca.evil.example/");
    const rejected=await probeExpandedSource(minerals,{now,fetchImpl:async()=>response(evil,"application/atom+xml")});
    expect(rejected.source_native_release_items).toBe(0);
    expect(rejected.topical_private_release_links_24h).toBe(0);
    const fake=documentType();
    function documentType(){return atomCanada.replace("<feed ","<!DOCTYPE atom><feed ");}
    expect((await probeExpandedSource(minerals,{now,fetchImpl:async()=>response(fake,"application/atom+xml")})).reason)
      .toBe("SOURCE_SHAPE_UNVERIFIED");
    expect((await probeExpandedSource(minerals,{now,fetchImpl:async()=>response(atomCanada,"text/html")})).reason)
      .toBe("SOURCE_CONTENT_TYPE_INVALID");
  });

  it("recovers exact 24h first-party article date when Atom only has updated, never from updated",async()=>{
    const src=EXPANDED_OFFICIAL_SOURCES[8];
    const source=atomCanada.replace("<published>2026-10-10T06:05:00Z</published>","");
    const page="<html><head><meta property='article:published_time' "+
      "content='2026-10-10T06:05:00Z'/></head><body>Government report</body></html>";
    const requests:string[]=[];
    const fetchImpl=async(url:string,opts:RequestInit)=>{
      requests.push(url);
      if(url===src.url)return response(source,"application/atom+xml");
      expect(opts.redirect).toBe("error");
      expect(url).toBe("https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals-update.html");
      return response(page,"text/html");
    };
    const result=await probeExpandedSource(src,{now,fetchImpl});
    expect(requests).toHaveLength(2);
    expect(result.source_native_24h_release_items).toBe(0);
    expect(result.original_page_precise_date_checks).toBe(1);
    expect(result.original_page_precise_date_24h).toBe(1);
    expect(result.topical_private_release_links_24h).toBe(1);
    expect(result.original_publisher_topical_90m).toBe(1);
    expect(result.original_publisher_topical_6h).toBe(1);
    expect(result.commercial_eligible).toBe(false);
    const futurePage=page.replace("2026-10-10T06:05:00Z","2026-10-11T06:05:00Z");
    const rejected=await probeExpandedSource(src,{now,fetchImpl:async(url:string)=>
      url===src.url?response(source,"application/atom+xml"):response(futurePage,"text/html")});
    expect(rejected.original_page_precise_date_checks).toBe(1);
    expect(rejected.topical_private_release_links_24h).toBe(0);
  });
  it("independently proves UN news native clocks without automatic risk promotion",async()=>{
    const un=EXPANDED_OFFICIAL_SOURCES[6];
    const nativeRss='<rss><channel><item><title>Security Council discusses ceasefire and armed conflict</title>'+
      '<link>https://news.un.org/en/story/2026/10/security-council</link>'+
      '<pubDate>Sat, 10 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>';
    const res=await probeExpandedSource(un,{now,fetchImpl:async()=>response(nativeRss,"application/rss+xml")});
    expect(res.topical_private_release_links_24h).toBe(1);
    expect(res.source_native_24h_release_items).toBe(1);
    expect(res.current_scored_intelligence_verified).toBe(false);
    const untrusted=nativeRss.replace("news.un.org","news.un.org.evil.test");
    const bad=await probeExpandedSource(un,{now,fetchImpl:async()=>response(untrusted,"application/rss+xml")});
    expect(bad.topical_private_release_links_24h).toBe(0);
  });

  it("distinguishes true 90min, 6h and 24h original publication windows without moving clocks",async()=>{
    const geo=EXPANDED_OFFICIAL_SOURCES[6];
    const rssAt=(time:string)=>'<rss><channel><item>'+
      '<title>Security Council security crisis and ceasefire update</title>'+
      '<link>https://news.un.org/en/story/2026/10/security-crisis</link>'+
      '<pubDate>'+time+'</pubDate></item></channel></rss>';
    const older=await probeExpandedSource(geo,{now,
      fetchImpl:async()=>response(rssAt("Sat, 10 Oct 2026 00:30:00 GMT"),"application/rss+xml")});
    expect(older.topical_private_release_links_24h).toBe(1);
    expect(older.original_publisher_topical_6h).toBe(0);
    expect(older.original_publisher_topical_90m).toBe(0);
    const within6=await probeExpandedSource(geo,{now,
      fetchImpl:async()=>response(rssAt("Sat, 10 Oct 2026 04:00:00 GMT"),"application/rss+xml")});
    expect(within6.original_publisher_topical_6h).toBe(1);
    expect(within6.original_publisher_topical_90m).toBe(0);
    const recent=await probeExpandedSource(geo,{now,
      fetchImpl:async()=>response(rssAt("Sat, 10 Oct 2026 06:30:00 GMT"),"application/rss+xml")});
    expect(recent.original_publisher_topical_6h).toBe(1);
    expect(recent.original_publisher_topical_90m).toBe(1);
    const forged=await probeExpandedSource(geo,{now,
      fetchImpl:async()=>response(rssAt("Sun, 11 Oct 2026 06:30:00 GMT"),"application/rss+xml")});
    expect(forged.original_publisher_topical_6h).toBe(0);
    expect(forged.original_publisher_topical_90m).toBe(0);
    for(const x of [older,within6,recent,forged]){
      expect(x.current_scored_intelligence_verified).toBe(false);
      expect(x.commercial_eligible).toBe(false);
    }
  });
  it("checks three independent original publisher RSS hosts, native times and no-raw commercialization",async()=>{
    const cases=[
      {index:9,title:"UK foreign secretary sanctions conflict statement",
       article:"https://www.gov.uk/government/news/uk-foreign-policy-security-statement"},
      {index:10,title:"Federal Reserve announces monetary policy interest rates",
       article:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm"},
      {index:11,title:"USGS announces critical mineral lithium supply review",
       article:"https://www.usgs.gov/news/national-news-release/critical-mineral-lithium"},
    ];
    for(const sample of cases){
      const source=EXPANDED_OFFICIAL_SOURCES[sample.index];
      const original=source.media==='atom'
        ? '<feed><entry><title>'+sample.title+'</title><published>2026-10-10T06:25:00Z</published>'+
          '<link rel="alternate" href="'+sample.article+'"/></entry></feed>'
        : '<rss><channel><item><title>'+sample.title+'</title>'+
          '<link>'+sample.article+'</link>'+
          '<pubDate>Sat, 10 Oct 2026 06:25:00 GMT</pubDate></item></channel></rss>';
      const out=await probeExpandedSource(source,{now,
        fetchImpl:async(url:string,opts:RequestInit)=>{
          expect(url).toBe(source.url);
          expect(opts.redirect).toBe("error");
          return response(original,source.media==="atom"?"application/atom+xml":"application/rss+xml");
        }});
      expect(out.format_valid).toBe(true);
      expect(out.source_native_24h_release_items).toBe(1);
      expect(out.original_publisher_topical_6h).toBe(1);
      expect(out.original_publisher_topical_90m).toBe(1);
      expect(out.commercial_rights_verified).toBe(false);
      expect(out.same_event_independent_corroboration_verified).toBe(false);
      expect(out.current_scored_intelligence_verified).toBe(false);
      expect(out.commercial_eligible).toBe(false);
      const forged=original.replace(new URL(sample.article).hostname,
        new URL(sample.article).hostname+".evil.example");
      const denied=await probeExpandedSource(source,{now,
        fetchImpl:async()=>response(forged,source.media==="atom"?"application/atom+xml":"application/rss+xml")});
      expect(denied.original_publisher_topical_90m).toBe(0);
      const future=source.media==="atom"
        ? original.replace("2026-10-10T06:25:00Z","2026-10-11T06:25:00Z")
        : original.replace("Sat, 10 Oct 2026 06:25:00 GMT","Sun, 11 Oct 2026 06:25:00 GMT");
      const ignored=await probeExpandedSource(source,{now,
        fetchImpl:async()=>response(future,source.media==="atom"?"application/atom+xml":"application/rss+xml")});
      expect(ignored.original_publisher_topical_90m).toBe(0);
    }
  });
  it("recovers RSS only from exact first-party article datePublished when pubDate absent",async()=>{
    for(const sourceIndex of [10,11]){
      const src=EXPANDED_OFFICIAL_SOURCES[sourceIndex];
      const article=sourceIndex===10
        ?"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm"
        :"https://www.usgs.gov/news/national-news-release/critical-minerals-supply-chain";
      const feed='<rss><channel><item><title>'+(
        sourceIndex===10?"Federal Reserve monetary policy interest rates"
          :"USGS critical minerals supply chain")+'</title><link>'+
          article+'</link></item></channel></rss>';
      const html='<html><head><meta property="article:published_time" '+
        'content="2026-10-10T06:25:00Z"/></head><body>private data</body></html>';
      let requests=0;
      const fetched=await probeExpandedSource(src,{now,fetchImpl:async(url:string)=>{
        requests++;
        if(url===src.url)return response(feed,"application/rss+xml");
        expect(url).toBe(article);
        return response(html,"text/html");
      }});
      expect(requests).toBe(2);
      expect(fetched.source_native_release_items).toBe(0);
      expect(fetched.original_page_precise_date_checks).toBe(1);
      expect(fetched.original_page_precise_date_24h).toBe(1);
      expect(fetched.original_publisher_topical_6h).toBe(1);
      expect(fetched.original_publisher_topical_90m).toBe(1);
      expect(fetched.commercial_eligible).toBe(false);
      const onlyModified=html.replace("article:published_time","article:modified_time");
      const notRecent=await probeExpandedSource(src,{now,fetchImpl:async(url:string)=>
        url===src.url?response(feed,"application/rss+xml"):
          response(onlyModified,"text/html")});
      expect(notRecent.original_page_precise_date_24h).toBe(0);
      expect(notRecent.original_publisher_topical_6h).toBe(0);
    }
  });
  it("only real original first-party article paths can count as independent 6h lanes",async()=>{
    const cases=new Map([
      ["un_news_security_original_rss_review",{
        title:"Security Council conflict ceasefire talks",
        link:"https://news.un.org/en/story/2026/10/security-council",
      }],
      ["uk_fcdo_original_foreign_policy_atom_review",{
        title:"Foreign secretary sanctions armed conflict",
        link:"https://www.gov.uk/government/news/foreign-policy-sanctions",
      }],
      ["statcan_prices_original_atom_review",{
        title:"Canada consumer price inflation release",
        link:"https://www150.statcan.gc.ca/n1/daily-quotidien/261010/dq261010a-eng.htm",
      }],
      ["fed_monetary_original_press_rss_review",{
        title:"Federal Reserve monetary policy interest rates",
        link:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
      }],
      ["nrcan_government_news_original_atom_review",{
        title:"Canadian critical minerals lithium mining supply",
        link:"https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html",
      }],
      ["usgs_minerals_original_news_rss_review",{
        title:"USGS critical mineral lithium supply",
        link:"https://www.usgs.gov/news/national-news-release/critical-mineral-lithium",
      }],
    ]);
    const feed=(src:any,title:string,link:string)=>{
      if(src.media==="atom")return '<feed><entry><title>'+title+'</title>'+
        '<published>2026-10-10T06:25:00Z</published>'+
        '<link rel="alternate" href="'+link+'"/></entry></feed>';
      return '<rss><channel><item><title>'+title+'</title>'+
        '<link>'+link+'</link><pubDate>Sat, 10 Oct 2026 06:25:00 GMT</pubDate>'+
        '</item></channel></rss>';
    };
    const privateFetch=async(url:string)=>{
      const source=EXPANDED_OFFICIAL_SOURCES.find((s:any)=>s.url===url);
      if(!source)throw Error("UNEXPECTED_OFFICIAL_SOURCE");
      if(source.media==="json")return response('{"data":[]}',"application/json");
      const sample=cases.get(source.id);
      const value=sample?feed(source,sample.title,sample.link)
        : source.media==="atom"?"<feed></feed>":"<rss><channel></channel></rss>";
      return response(value,source.media==="atom"?"application/atom+xml":"application/rss+xml");
    };
    const grouped=await probeExpandedOfficialMesh({now,fetchImpl:privateFetch});
    expect(grouped.status).toBe("SOURCE_TRANSPORT_OBSERVED");
    for(const domain of ["geopolitics","macro","rare_earth"]){
      const proof=grouped.independent_original_origin_lanes[domain];
      expect(proof.organizations_with_6h_originals).toBe(2);
      expect(proof.organizations_with_90m_originals).toBe(2);
      expect(proof.possible_two_independent_origins_in_6h).toBe(true);
      // Even two genuine first-party publishers are not necessarily
      // confirming the SAME event. No unsigned payment/score promotion.
      expect(proof.same_event_independent_corroboration_verified).toBe(false);
      expect(proof.source_rights_verified).toBe(false);
      expect(proof.commercial_eligible).toBe(false);
    }
    const fed=EXPANDED_OFFICIAL_SOURCES[10];
    for(const nonArticle of [
      "https://www.federalreserve.gov/feeds/press_all.xml",
      "https://www.federalreserve.gov/newsevents/pressreleases/",
      "https://www.federalreserve.gov/newsevents/pressreleases/rss/",
      "https://www.federalreserve.gov.evil.example/newsevents/pressreleases/test",
    ]){
      const out=await probeExpandedSource(fed,{
        now,fetchImpl:async()=>response(feed(fed,
          "Federal Reserve monetary policy interest rates",nonArticle),
          "application/rss+xml"),
      });
      expect(out.original_publisher_topical_6h).toBe(0);
      expect(out.original_publisher_topical_90m).toBe(0);
      expect(out.current_scored_intelligence_verified).toBe(false);
    }
    const uk=EXPANDED_OFFICIAL_SOURCES[9];
    const notArticle=await probeExpandedSource(uk,{now,fetchImpl:async()=>response(
      feed(uk,"Foreign secretary sanctions armed conflict",
        "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office"),
      "application/atom+xml")});
    expect(notArticle.topical_private_release_links_24h).toBe(0);
    const usgs=EXPANDED_OFFICIAL_SOURCES[11];
    const selfFeed=await probeExpandedSource(usgs,{now,fetchImpl:async()=>response(
      feed(usgs,"USGS critical minerals lithium supply",usgs.url),
      "application/rss+xml")});
    expect(selfFeed.original_publisher_topical_6h).toBe(0);
    expect(JSON.stringify(grouped)).not.toContain("foreign-policy-sanctions");
    expect(JSON.stringify(grouped)).not.toContain("critical-mineral-lithium");
    expect(JSON.stringify(grouped)).not.toContain("monetary20261010a");
  });

  it("workflow has no cloud secrets, no database writes and no auto paid promotion",()=>{
    const yaml=readFileSync(".github/workflows/expanded-official-source-observation.yml","utf8");
    const probe=readFileSync("scripts/ops/probe-expanded-official-source-mesh.mjs","utf8");
    expect(yaml).toContain("branches: [main]");
    expect(yaml).toContain("workflow_dispatch:");
    expect(yaml).toContain("node scripts/ops/probe-expanded-official-source-mesh.mjs");
    for(const forbidden of ["SUPABASE_SERVICE_ROLE_KEY","B2_KEY_ID","COINBASE","GROQ_API_KEY","USDC"]) {
      expect(yaml).not.toContain(forbidden);
    }
    expect(probe).not.toContain("commercial_eligible:true");
    expect(probe).not.toContain("supabase.from(");
  });
});
