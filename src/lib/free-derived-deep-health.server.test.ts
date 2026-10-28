import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  classifyFreeDerivedFeed,probeFreeDerivedDeepHealth,
} from "./free-derived-deep-health.server";

const time=Date.parse("2026-10-21T00:00:00.000Z");
const native="2026-10-20T22:30:00.000Z";
const story=(category="geopolitics",overrides:Record<string,unknown>={})=>({
  id:category+"-abcdef12",category,date_precision:"exact",published_at:native,
  title:"Geomacro finds a verified original-dated official development",
  status:"official_release_observed_unscored",severity:null,
  same_event_corrob_verified:false,...overrides,
});
const feed=(signals:unknown[]=[story()],updates:Record<string,unknown>={})=>({
  ok:true,schema:"geomacro.website-derived-news-feed.v1",
  checked_at:"2026-10-21T00:00:00.000Z",
  original_release_delay_minutes:0,retention_hours:72,retention_days:3,
  delivery_scope:"free_website_only",
  scored:false,chargeable:false,supabase_dependency:false,
  signals,...updates,
});
describe("authentic free-derived static archive deep-health",()=>{
  it("accepts one real, original-dated unscored static archive story without pretending 3-domain signed readiness",()=>{
    const v=classifyFreeDerivedFeed(feed(),time);
    expect(v.statusCode).toBe(200);
    expect(v.body.categories).toEqual({geopolitics:1,macro:0,rare_earth:0});
    expect(v.body.all_three_categories_have_recent_originals).toBe(false);
    expect(v.body.current_numerical_gri_verified).toBe(false);
    expect(v.body.current_signed_hot_snapshots_attested).toBe(false);
    expect(v.body.legacy_signed_intelligence_gri_risk_indices)
      .toBe("NOT_EVALUATED_IN_THIS_PROFILE");
    expect(v.body.free_website_ssr_attested).toBe(false);
    expect(v.body.x402_payment_authorized).toBe(false);
    expect(v.body.consumer_commercial_rights_verified).toBe(false);
    expect(v.body.feed_source).toBe("permanent_static_archive");
    expect(v.body.d1_reads_performed).toBe(false);
    expect(v.body.b2_read_performed).toBe(false);
    expect(v.body.supabase_access_performed).toBe(false);
  });
  it("does not treat feed-only OSINT as official-source health proof",()=>{
    const osint=story("macro",{
      status:"osint_feed_observed_unverified",
      development_type:"unverified OSINT feed observation",
      geography:null,
      sources_credited:["Monitored feed: example.net"],
    });
    const onlyOsint=classifyFreeDerivedFeed(feed([osint]),time);
    expect(onlyOsint.statusCode).toBe(503);
    expect(onlyOsint.body.current_72h_derived_rows).toBe(0);
    const officialAndOsint=classifyFreeDerivedFeed(feed([story(),osint]),time);
    expect(officialAndOsint.statusCode).toBe(200);
    expect(officialAndOsint.body.current_72h_derived_rows).toBe(1);
    expect(officialAndOsint.body.categories).toEqual({geopolitics:1,macro:0,rare_earth:0});
   });
  it("accepts unverified OSINT monitored hostname incl www without allowing article link/raw source",()=>{
    const observed=story("macro",{
      status:"osint_feed_observed_unverified",
      development_type:"unverified OSINT feed observation",
      geography:null,
      sources_credited:["Monitored feed: www.bankofcanada.ca"],
    });
    const valid=classifyFreeDerivedFeed(feed([story(),observed]),time);
    expect(valid.statusCode).toBe(200);
    expect(valid.body.categories).toEqual({geopolitics:1,macro:0,rare_earth:0});
    expect(valid.body.current_72h_derived_rows).toBe(1);
    expect(valid.body.current_signed_hot_snapshots_attested).toBe(false);
    expect(valid.body.consumer_commercial_rights_verified).toBe(false);
    const aggregator={...observed,sources_credited:[
      "Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
    expect(classifyFreeDerivedFeed(feed([story(),aggregator]),time).statusCode).toBe(200);
    for(const credit of [
      "Monitored feed: https://bankofcanada.ca/story",
      "Monitored feed: www.bankofcanada.ca/monetary-policy",
      "Monitored feed: www.bankofcanada.ca?secret=foo",
      "Monitored feed: www.bankofcanada.ca#fragment",
      "Monitored feed: bankofcanada.ca (aggregator; original publisher not verified)",
      "Monitored feed: www.bankofcanada.ca.evil/path",
      "Monitored feed: -bankofcanada.ca",
      "Monitored feed: example..org",
      "Monitored feed: www.bankofcanada.ca<script>alert(1)</script>",
    ]){
      const bad=classifyFreeDerivedFeed(feed([story(),{
        ...observed,sources_credited:[credit]}]),time);
      expect(bad.statusCode).toBe(503);
    }
    for(const bad of [
      {...observed,upstream_url:"https://publisher.example/article"},
      {...observed,what_changed:"www.publisher.example/raw"},
      {...observed,geography:"Toronto"},
      {...observed,status:"official_release_observed_unscored"},
    ])expect(classifyFreeDerivedFeed(feed([story(),bad]),time).statusCode).toBe(503);
  });
  it("reports all 3 original categories ONLY when actually present",()=>{
    const rows=[story(),story("macro"),story("rare_earth")];
    const v=classifyFreeDerivedFeed(feed(rows),time);
    expect(v.statusCode).toBe(200);
    expect(v.body.all_three_categories_have_recent_originals).toBe(true);
    expect(v.body.current_numerical_gri_verified).toBe(false);
  });
  it("fails empty, stale, future, invalid, duplicate or scored stories",()=>{
    expect(classifyFreeDerivedFeed(feed([]),time).statusCode).toBe(503);
    for(const published_at of ["2026-10-16T00:00:00.000Z",
      "invalid","2026-10-21T01:00:00.000Z"]){
      expect(classifyFreeDerivedFeed(feed([story("geopolitics",{published_at})]),time)
        .statusCode).toBe(503);
    }
    expect(classifyFreeDerivedFeed(feed([story(),story()]),time).statusCode).toBe(503);
    for(const overrides of [
      {severity:6},{same_event_corrob_verified:true},{source_url:"https://raw.example.org"},
      {status:"verified_b2"},{date_precision:"day",published_at:"2026-10-20"},
    ]){
      expect(classifyFreeDerivedFeed(feed([story("geopolitics",overrides)]),time)
        .statusCode).toBe(503);
    }
    const validDay=story("geopolitics",{date_precision:"day",published_at:"2026-10-19"});
    expect(classifyFreeDerivedFeed(feed([validDay]),time).statusCode).toBe(200);
  });
  it("rejects invalid metadata, old replayed checked_at, and commercial flags",()=>{
    for(const overrides of [
      {original_release_delay_minutes:1},{retention_hours:720},
      {chargeable:true},{scored:true},{supabase_dependency:true},
      {delivery_scope:"paid"},{checked_at:"2026-10-22T00:00:00.000Z"},
      {page_offset:250},{page_size:1000},{has_more:true},{signals:"invalid"},
    ]){
      expect(classifyFreeDerivedFeed(feed([story()],overrides),time).statusCode)
        .toBe(503);
    }
  });
  it("allows a cached archive generation clock only when original event times remain valid",()=>{
    const cached=classifyFreeDerivedFeed(feed(),Date.parse("2026-10-21T00:00:00.000Z"));
    expect(cached.statusCode).toBe(200);
    expect(classifyFreeDerivedFeed(feed([story("geopolitics",{published_at:"2026-10-16T00:00:00.000Z"})]),
      time).statusCode).toBe(503);
  });
  it("uses the permanent static public archive and not the D1 news endpoint",async()=>{
    const create=(body:unknown)=>vi.fn<typeof fetch>(async()=>new Response(JSON.stringify(body),{
      status:200,headers:{"content-type":"application/json"},
    }));
    const fetcher=create(feed());
    const response=await probeFreeDerivedDeepHealth({fetcher,now:()=>time});
    expect(response.statusCode).toBe(200);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json");
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("follow");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("geomacro-control-plane");
  });
  it("rejects a redirect that leaves the pinned archive origin",async()=>{
    const response=new Response(JSON.stringify(feed()),{
      status:200,headers:{"content-type":"application/json"},
    });
    Object.defineProperty(response,"url",{value:"https://untrusted.example/latest.json"});
    const result=await probeFreeDerivedDeepHealth({
      fetcher:vi.fn<typeof fetch>(async()=>response),now:()=>time,
    });
    expect(result.statusCode).toBe(503);
    expect(result.body.reason).toBe("FREE_ARCHIVE_REDIRECT_ORIGIN_INVALID");
  });
  it("returns HTTP 503 on remote 503, non-JSON, oversize or outage; never a synthetic green",async()=>{
    const create=(body:unknown,status=200,type="application/json")=>
      vi.fn<typeof fetch>(async()=>new Response(JSON.stringify(body),{
        status,headers:{"content-type":type},
      }));
    const test=await probeFreeDerivedDeepHealth({
      fetcher:create(feed()),now:()=>time});
    expect(test.statusCode).toBe(200);
    for(const result of [
      await probeFreeDerivedDeepHealth({fetcher:create({ok:false},503),now:()=>time}),
      await probeFreeDerivedDeepHealth({fetcher:create(feed(),200,"text/html"),now:()=>time}),
      await probeFreeDerivedDeepHealth({fetcher:vi.fn<typeof fetch>(async()=>{throw Error("network");}),now:()=>time}),
    ])expect(result.statusCode).toBe(503);
  });
  it("preserves strict signed product deep-health and old live-structured profile intact",()=>{
    const route=readFileSync("src/routes/api.health.ts","utf8");
    expect(route).toContain('if (profile === "free-derived")');
    expect(route).toContain("await probeFreeDerivedDeepHealth()");
    expect(route).toContain('profile !== "live-structured"');
    expect(route).toContain('await probeLiveStructuredDeepHealth()');
    expect(route).toContain("await getPublicProductionReadiness(deep)");
    expect(route).toContain('publicProduction.risk_verification_status === "verified"');
    expect(route).toContain("Object.values(publicProduction.hot_snapshot_serving ?? {}).every((proof) => proof.ok)");
    expect(route).toContain("status: deepReady ? 200 : 503");
    expect(route).toContain("chargeable:false");
  });
  it("keeps a genuine current official story when static OSINT crosses the rolling 72h edge",()=>{
    const expired="2026-10-17T23:30:00.000Z";
    const monitored=story("macro",{
      published_at:expired,status:"osint_feed_observed_unverified",
      development_type:"unverified OSINT feed observation",geography:null,
      sources_credited:["Monitored feed: example.org"],
    });
    const observed=classifyFreeDerivedFeed(feed([story(),monitored],{
      checked_at:"2026-10-20T23:00:00.000Z",
    }),time);
    expect(observed.statusCode).toBe(200);
    expect(observed.body.current_72h_derived_rows).toBe(1);
    expect(observed.body.categories).toEqual({geopolitics:1,macro:0,rare_earth:0});
    expect(observed.body.current_signed_hot_snapshots_attested).toBe(false);
    // Even an expired official original is never counted as current.
    const onlyExpired=classifyFreeDerivedFeed(feed([
      story("macro",{published_at:expired}),
    ],{checked_at:"2026-10-20T23:00:00.000Z"}),time);
    expect(onlyExpired.statusCode).toBe(503);
    expect(onlyExpired.body.current_72h_derived_rows).toBe(0);
  });
  it("rejects invalid-at-build expiry, expired private URLs and abandoned static snapshots",()=>{
    const earlier="2026-10-17T22:00:00.000Z";
    const checked="2026-10-20T23:00:00.000Z";
    const alreadyExpired=classifyFreeDerivedFeed(feed([story(),story("macro",{
      published_at:earlier,
    })],{checked_at:checked}),time);
    expect(alreadyExpired.statusCode).toBe(503);
    const staleWithRaw=classifyFreeDerivedFeed(feed([story(),story("macro",{
      published_at:"2026-10-17T23:30:00.000Z",
      upstream_url:"https://source.example/article",
    })],{checked_at:checked}),time);
    expect(staleWithRaw.statusCode).toBe(503);
    const abandoned=classifyFreeDerivedFeed(feed([story()],{
      checked_at:"2026-10-20T17:00:00.000Z",
    }),time);
    expect(abandoned.statusCode).toBe(503);
    expect(abandoned.body.reason).toBe("FREE_ARCHIVE_CLOCK_INVALID");
  });

});
