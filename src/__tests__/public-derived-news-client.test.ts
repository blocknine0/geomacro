import { describe, expect, it, vi } from "vitest";
import {
  checkedDerivedNews, fetchDirectDerivedNews, GEOMACRO_DERIVED_JOURNAL_URL,
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
  original_release_delay_minutes:15,retention_days:3,retention_hours:72,delivery_scope:"free_website_only",signals});
describe("browser public journal fallback",()=>{
  it("serves original-dated derived cards without browser server-RPC dependency",async()=>{
    const f=vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(doc([signal])),{
      status:200,headers:{"content-type":"application/json"},
    }));
    const rows=await fetchDirectDerivedNews(f as typeof fetch,NOW);
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0]?.[0]).toBe(GEOMACRO_DERIVED_JOURNAL_URL);
    expect(rows).toEqual([signal]);
  });
  it("rejects early/old/unverified/source-leaking objects and unrecognized document scope",()=>{
    expect(checkedDerivedNews(doc([
      signal,
      {...signal,id:"macro-87654321",published_at:"2026-10-12T19:55:00.000Z"},
      {...signal,id:"macro-87654322",published_at:"2026-08-20T19:00:00.000Z"},
      {...signal,id:"macro-87654323",severity:90},
      {...signal,id:"macro-87654324",source_url:"https://private-source.example.com"},
      {...signal,id:"macro-87654325",same_event_corrob_verified:true},
    ]),NOW)).toEqual([signal]);
    expect(()=>checkedDerivedNews({...doc([signal]),original_release_delay_minutes:0},NOW)).toThrow();
  });
  it.each(["geopolitics","macro","rare_earth"])("reads verified D1 original publication DAY in %s without fabricating time",category=>{
    const day={...signal,
      id:category+"-1234abcd",category,date_precision:"day",
      published_at:"2026-10-12"};
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-13T12:14:59Z"))).toEqual([]);
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-13T12:15:00Z"))).toEqual([day]);
    for (const invalid of ["2026-02-30","2026-10-13","2026-10-12T12:00:00Z"]){
      expect(checkedDerivedNews(doc([{...day,published_at:invalid}]),
        Date.parse("2026-10-13T12:15:00Z"))).toEqual([]);
    }
    expect(checkedDerivedNews(doc([{...day,severity:70}]),
      Date.parse("2026-10-13T12:15:00Z"))).toEqual([]);
  });
  it("does not invent an EU original hour and waits full day-only release delay",()=>{
    const day={...signal,id:"rare_earth-1234abcd",category:"rare_earth",
      published_at:"2026-10-09",date_precision:"day"};
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-10T12:14:59Z"))).toEqual([]);
    expect(checkedDerivedNews(doc([day]),Date.parse("2026-10-10T12:15:00Z"))).toEqual([day]);
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
  it("rejects source metadata and unknown fields even without a source URL",()=>{
    for(const extra of [{source_name:"private supplier"},{provider_id:"private"},
      {source_record_id:"private"},{unexpected:"hidden metadata"},{geography:{supplier:"private"}},
      {published_at:"2026-02-30T18:30:00.000Z"}])
      expect(checkedDerivedNews(doc([{...signal,...extra}]),NOW)).toEqual([]);
    expect(checkedDerivedNews(doc([signal]),NOW)).toEqual([signal]);
  });

});
