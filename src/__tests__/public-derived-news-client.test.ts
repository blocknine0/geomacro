import { describe, expect, it, vi } from "vitest";
import {
  checkedDerivedNews, fetchDirectDerivedNews, fetchAllDerivedNews, fetchPermanentDerivedNews,
  GEOMACRO_DERIVED_JOURNAL_URL, GEOMACRO_DERIVED_BUNDLE_URL, GEOMACRO_PERMANENT_LATEST_URL, GEOMACRO_PERMANENT_ARCHIVE_BASE_URL,
} from "@/lib/public-derived-news-client";

const NOW=Date.parse("2026-10-12T20:00:00.000Z");
const signal={
  id:"macro-1234abcd",category:"macro",
  title:"Geomacro finds monetary policy update for bank liquidity",
  what_changed:"An official publisher issued a monetary policy update concerning liquidity.",
  why_it_matters:"A change in funding conditions may affect financing and foreign exchange risk.",
  topic:"monetary policy", geography:null, development_type:"monetary policy",
  published_at:"2026-10-12T18:30:00.000Z",date_precision:"exact",
  observed_release_count:1,sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null,
};
const doc=(signals:unknown[]=[])=>({ok:true,schema:"geomacro.website-derived-news-feed.v1",
  original_release_delay_minutes:0,retention_days:3,retention_hours:72,delivery_scope:"free_website_only",signals});
describe("browser public journal fallback",()=>{
  it.each(["geopolitics","macro","rare_earth"])("admits newly published %s immediately across old/new feed envelopes, with strict future rejection",category=>{
    for(const age of [0,1_000,5*60_000]){
      const row={...signal,id:category+"-1234abcd",category,
        published_at:new Date(NOW-age).toISOString()};
      for(const metadata of [0,15]){
        const envelope={...doc([row]),original_release_delay_minutes:metadata};
        expect(checkedDerivedNews(envelope,NOW)).toEqual([row]);
        expect(checkedDerivedNews({...envelope,signals:[{...row,published_at:new Date(NOW+1).toISOString()}]},NOW)).toEqual([]);
      }
    }
  });

  it("serves original-dated derived cards from cacheable static assets without browser server-RPC dependency",async()=>{
    const f=vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.cache).toBeUndefined();
      expect(init?.redirect).toBe("manual");
      return new Response(JSON.stringify(doc([signal])),{
        status:200,headers:{"content-type":"application/json"},
      });
    });
    const rows=await fetchDirectDerivedNews(f as typeof fetch,NOW);
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0]?.[0]).toBe(GEOMACRO_PERMANENT_LATEST_URL);
    expect(rows).toEqual([signal]);
  });
  it("loads permanent month/category shards only from static assets, never D1",async()=>{
    const index={schema:"geomacro.permanent-derived-news-archive-index.v1",
      updated_at:new Date(NOW).toISOString(),months:["2026-10"],
      categories:["geopolitics","macro","rare_earth"],seed_complete:true,total_signals:1};
    const calls:string[]=[];
    const f=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      calls.push(url);
      expect(init?.redirect).toBe("manual");
      expect(init?.cache).toBeUndefined();
      if(url===GEOMACRO_PERMANENT_ARCHIVE_BASE_URL+"/index.json")
        return new Response(JSON.stringify(index),{status:200});
      const category=url.endsWith("/geopolitics.json")?"geopolitics":
        url.endsWith("/macro.json")?"macro":"rare_earth";
      return new Response(JSON.stringify({
        schema:"geomacro.permanent-derived-news-archive-month.v1",
        month:"2026-10",category,signals:category==="macro"?[signal]:[],
      }),{status:200});
    });
    const rows=await fetchPermanentDerivedNews(f as typeof fetch,NOW);
    expect(rows).toEqual([signal]);
    expect(calls).toHaveLength(4);
    expect(calls.every(url=>url.startsWith(GEOMACRO_PERMANENT_ARCHIVE_BASE_URL+"/"))).toBe(true);
    expect(calls.some(url=>url.includes("geomacro-control-plane"))).toBe(false);
    expect(calls.some(url=>url.includes("supabase"))).toBe(false);
  });

  it("rejects early/old/unverified/source-leaking objects and unrecognized document scope",()=>{
    expect(checkedDerivedNews(doc([
      signal,
      {...signal,id:"macro-87654321",published_at:"2026-10-12T20:00:01.000Z"},
      {...signal,id:"macro-87654322",published_at:"2026-08-20T19:00:00.000Z"},
      {...signal,id:"macro-87654323",severity:90},
      {...signal,id:"macro-87654324",source_url:"https://private-source.example.com"},
      {...signal,id:"macro-87654325",same_event_corrob_verified:true},
    ]),NOW)).toEqual([signal]);
    expect(()=>checkedDerivedNews({...doc([signal]),original_release_delay_minutes:1},NOW)).toThrow();
  });
  it.each(["geopolitics","macro","rare_earth"])("reads verified D1 original publication DAY in %s without fabricating time",category=>{
    const day={...signal,
      id:category+"-1234abcd",category,date_precision:"day",
      published_at:"2026-10-12"};
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-13T11:59:59Z"))).toEqual([]);
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-13T12:00:00Z"))).toEqual([day]);
    for (const invalid of ["2026-02-30","2026-10-13","2026-10-12T12:00:00Z"]){
      expect(checkedDerivedNews(doc([{...day,published_at:invalid}]),
        Date.parse("2026-10-13T12:00:00Z"))).toEqual([]);
    }
    expect(checkedDerivedNews(doc([{...day,severity:70}]),
      Date.parse("2026-10-13T12:00:00Z"))).toEqual([]);
  });
  it("does not invent an EU original hour and waits full day-only release delay",()=>{
    const day={...signal,id:"rare_earth-1234abcd",category:"rare_earth",
      published_at:"2026-10-09",date_precision:"day"};
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-10T11:59:59Z"))).toEqual([]);
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-10T12:00:00Z"))).toEqual([day]);
  });
  it("uses workerd-supported manual mode and rejects every redirect without retry",async()=>{
    for(const status of [301,302,303,307,308]){
      const f=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
        expect(init?.redirect).toBe("manual");
        return new Response(null,{status,headers:{Location:"https://untrusted.invalid/"}});
      });
      await expect(fetchDirectDerivedNews(f,NOW)).rejects.toThrow("UPSTREAM_REDIRECT_REJECTED");
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("recovers a safe GET after bounded transient 503 and transport failures",async()=>{
    let calls=0;
    const f=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      calls++;
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("manual");
      if(calls===1)return new Response("temporary unavailable",{status:503});
      if(calls===2)throw new TypeError("transient socket failure");
      return new Response(JSON.stringify(doc([signal])),{
        status:200,headers:{"content-type":"application/json"},
      });
    });
    const rows=await fetchDirectDerivedNews(f as typeof fetch,NOW);
    expect(rows).toEqual([signal]);
    expect(calls).toBe(3);
  });
  it("does not retry a known D1 daily quota rejection until the UTC reset",async()=>{
    const f=vi.fn(async()=>new Response(JSON.stringify({
      ok:false,error:"DERIVED_NEWS_FEED_UNAVAILABLE",
      diagnostic_code:"D1_DAILY_ROW_READ_LIMIT",signals:[],
    }),{status:503,headers:{"content-type":"application/json"}}));
    await expect(fetchDirectDerivedNews(f as typeof fetch,NOW))
      .rejects.toThrow("DERIVED_NEWS_PUBLIC_FETCH_D1_DAILY_ROW_READ_LIMIT");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("bounds persistent public GET failures and never retries hard 4xx",async()=>{
    let calls=0;
    const unavailable=vi.fn(async()=>{calls++;return new Response("temporary",{status:503});});
    await expect(fetchDirectDerivedNews(unavailable as typeof fetch,NOW))
      .rejects.toThrow("DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
    expect(calls).toBe(3);
    let forbiddenCalls=0;
    const forbidden=vi.fn(async()=>{forbiddenCalls++;return new Response("denied",{status:403});});
    await expect(fetchDirectDerivedNews(forbidden as typeof fetch,NOW))
      .rejects.toThrow("DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE");
    expect(forbiddenCalls).toBe(1);
  });

  it("uses one uncached complete D1 bundle for exact publisher readback and rejects stale fallback",async()=>{
    const now=Date.now();
    const row={...signal,published_at:new Date(now-1000).toISOString()};
    const makeBundle=(checkedAt:string)=>({
      ok:true,schema:"geomacro.website-derived-news-bundle.v1",
      checked_at:checkedAt,original_release_delay_minutes:0,retention_days:3,
      retention_hours:72,delivery_scope:"free_website_only",complete:true,
      item_cap:600,returned_rows:1,signals:[row],
      first_ingest:[{id:row.id,first_seen_at:new Date(now-2000).toISOString()}],
    });
    const fresh=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      expect(String(input)).toBe(GEOMACRO_DERIVED_BUNDLE_URL);
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("cache-control")).toBe("no-cache");
      return new Response(JSON.stringify(makeBundle(new Date(now).toISOString())),{status:200,
        headers:{"content-type":"application/json"}});
    });
    expect(await fetchAllDerivedNews(fresh as typeof fetch,now,{fresh:true})).toEqual([row]);
    expect(fresh).toHaveBeenCalledOnce();

    const stale=vi.fn(async()=>new Response(JSON.stringify(
      makeBundle(new Date(Date.now()-60_000).toISOString())),{status:200,
      headers:{"content-type":"application/json"}}));
    await expect(fetchAllDerivedNews(stale as typeof fetch,Date.now(),{fresh:true}))
      .rejects.toThrow("DERIVED_NEWS_BUNDLE_STALE_READBACK");
    expect(stale).toHaveBeenCalledOnce();
  });

  it("lets ordinary journal reads use the short public edge cache without forcing D1 readback",async()=>{
    const now=Date.now();
    const row={...signal,published_at:new Date(now-1000).toISOString()};
    const payload={
      ok:true,schema:"geomacro.website-derived-news-bundle.v1",
      checked_at:new Date(now).toISOString(),original_release_delay_minutes:0,
      retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
      complete:true,item_cap:600,returned_rows:1,signals:[row],
      first_ingest:[{id:row.id,first_seen_at:new Date(now-2000).toISOString()}],
    };
    const ordinary=vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
      expect(init?.cache).toBeUndefined();
      const headers=new Headers(init?.headers);
      expect(headers.get("cache-control")).toBeNull();
      expect(headers.get("pragma")).toBeNull();
      return new Response(JSON.stringify(payload),{status:200,
        headers:{"content-type":"application/json","cache-control":"public, max-age=15"}});
    });
    expect(await fetchAllDerivedNews(ordinary as typeof fetch,now,{fresh:false})).toEqual([row]);
    expect(ordinary).toHaveBeenCalledOnce();
  });

  it("falls back only when a deployed Worker lacks the bundle route, never on storage/quota errors",async()=>{
    const now=Date.now();
    const row={...signal,published_at:new Date(now-1000).toISOString()};
    const legacyPage={...doc([row]),checked_at:new Date(now).toISOString(),
      page_offset:0,page_size:250,has_more:false,next_offset:null};
    const fallback=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(String(input)===GEOMACRO_DERIVED_BUNDLE_URL)
        return new Response(null,{status:401});
      return new Response(JSON.stringify(legacyPage),{status:200,
        headers:{"content-type":"application/json"}});
    });
    expect(await fetchAllDerivedNews(fallback as typeof fetch,now)).toEqual([row]);
    expect(fallback).toHaveBeenCalledTimes(2);

    const quota=vi.fn(async(input:RequestInfo|URL)=>{
      expect(String(input)).toBe(GEOMACRO_DERIVED_BUNDLE_URL);
      return new Response(JSON.stringify({ok:false,error:"DERIVED_NEWS_BUNDLE_UNAVAILABLE",
        diagnostic_code:"D1_DAILY_ROW_READ_LIMIT"}),{status:503,
        headers:{"content-type":"application/json"}});
    });
    await expect(fetchAllDerivedNews(quota as typeof fetch,now))
      .rejects.toThrow("DERIVED_NEWS_PUBLIC_FETCH_D1_DAILY_ROW_READ_LIMIT");
    expect(quota).toHaveBeenCalledOnce();
  });

  it("rejects source metadata and unknown fields even without a source URL",()=>{
    for(const extra of [{source_name:"private supplier"},{provider_id:"private"},
      {source_record_id:"private"},{unexpected:"hidden metadata"},{geography:{supplier:"private"}},
      {published_at:"2026-02-30T18:30:00.000Z"}])
      expect(checkedDerivedNews(doc([{...signal,...extra}]),NOW)).toEqual([]);
    expect(checkedDerivedNews(doc([signal]),NOW)).toEqual([signal]);
  });

});
