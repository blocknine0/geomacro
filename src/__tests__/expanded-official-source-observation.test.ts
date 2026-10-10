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
describe("#1827 expanded official three-domain private observation lane",()=>{
  it("has six fixed official source observations across exactly three domains",()=>{
    expect(EXPANDED_OFFICIAL_SOURCES.map((s:any)=>s.domain))
      .toEqual(["geopolitics","macro","macro","rare_earth","rare_earth","rare_earth"]);
    for(const s of EXPANDED_OFFICIAL_SOURCES){
      expect(new URL(s.url).protocol).toBe("https:");
      expect(s.rights).toBe("UNVERIFIED");
      expect(s.event_intelligence).toBe(false);
      expect(s.country_coverage_verified).toBe(false);
      expect(s.poll).toBe("six_hourly");
    }
    expect(EXPANDED_OFFICIAL_SOURCES[2].alternate_url)
      .toBe("https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/de/statistics-update.rss");
    expect(EXPANDED_OFFICIAL_SOURCES.filter((s:any)=>s.alternate_url)).toHaveLength(1);
    expect(EXPANDED_OFFICIAL_SOURCES.map((s:any)=>new URL(s.url).host))
      .toEqual(["finance.ec.europa.eu","www.ecb.europa.eu","ec.europa.eu","eiti.org","european-union.europa.eu","natural-resources.canada.ca"]);
  });
  it("samples only fixed official sources; release dates cannot prove scored current events",async()=>{
    const seen:string[]=[];
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      seen.push(url);
      expect(options.redirect).toBe("error");
      expect(options.credentials).toBeUndefined();
      if(new URL(url).hostname === "eiti.org")
        return response(JSON.stringify({data:[{id:1,year:2024}]}),"application/json");
      return response(xml,"application/rss+xml");
    });
    const res=await probeExpandedOfficialMesh({fetchImpl,now});
    expect(fetchImpl).toHaveBeenCalledTimes(6);
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
      return response(xml,"application/rss+xml");
    }});
    expect(res.status).toBe("SOURCE_TRANSPORT_DEGRADED");
    expect(res.sources.map((x:any)=>x.publisher_reachable)).toEqual([true,false,true,true,true,true]);
    expect(res.globally_current_scored_coverage_verified).toBe(false);
    expect(res.commercial_eligible).toBe(false);
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
