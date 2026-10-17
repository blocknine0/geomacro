import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {observeOperatorFreeFeedRotation,PUBLIC_FEED_ROTATION} from "../../scripts/ops/observe-operator-free-feed-rotation.mjs";

const now=new Date("2026-10-12T12:00:00Z");
const rss=`<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
<item><title>Central bank interest rate inflation</title>
<pubDate>Mon, 12 Oct 2026 11:30:00 GMT</pubDate></item>
<item><title>Lithium mining contract</title>
<pubDate>Sun, 11 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

describe("operator public RSS candidate rotating bounded discovery",()=>{
  it("reuses exactly 10 permitted-to-probe user-submitted IDs, no original source duplicates or paid products",()=>{
    const ids=PUBLIC_FEED_ROTATION.map(x=>x.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    const registry=JSON.parse(readFileSync("config/operator-76-source-attribution-intake.v1.json","utf8"));
    for(const f of PUBLIC_FEED_ROTATION){
      const entry=registry.entries.find((x:{id:string})=>x.id===f.id);
      expect(entry.runtime_state).toBe("SCHEDULED_BOUNDED_PRIVATE_REVIEW");
      expect(entry.canonical_existing_id).toBeNull();
      expect(entry.candidate_endpoint).toBe(f.url);
      expect(f.url.startsWith("https://")).toBe(true);
    }
    expect(ids).not.toContain("news_bbc");
    expect(ids).not.toContain("news_scmp");
    expect(ids).not.toContain("re_news_mining");
    expect(ids).not.toContain("news_nikkei");
    expect(registry.entries.find((x:{id:string})=>x.id==="news_bbc").runtime_state)
      .toBe("HOLD_BUSINESS_RSS_LICENSE_REQUIRED");
    expect(registry.entries.find((x:{id:string})=>x.id==="news_scmp").runtime_state)
      .toBe("HOLD_COMMERCIAL_AUTOMATED_ACCESS_PROHIBITED");
    expect(registry.entries.find((x:{id:string})=>x.id==="news_nikkei").runtime_state)
      .toBe("HOLD_NONCOMMERCIAL_PROVIDER_TERMS");
    expect(registry.entries.find((x:{id:string})=>x.id==="re_news_mining").runtime_state)
      .toBe("QUARANTINED_PROVIDER_403");
    expect(ids).not.toContain("news_reuters_ap");
    expect(ids).not.toContain("opensanctions");
    expect(ids).not.toContain("re_smm");
    expect(ids).not.toContain("gdelt_events");
    expect(ids).not.toContain("reliefweb");
  });
  it("reads one bounded private group with no raw articles retained",async()=>{
    const mock=vi.fn(async(url:string)=>{
      const host=new URL(url).hostname;
      if(host==="api.bls.gov")return new Response(JSON.stringify({
        status:"REQUEST_SUCCEEDED",Results:{series:[{data:[{year:"2026",period:"M09"}]}]}
      }));
      if(host==="ofac.treasury.gov")return new Response("<!doctype html><html>Recent actions</html>");
      return new Response(rss);
    });
    const r=await observeOperatorFreeFeedRotation({group:0,now,fetchImpl:mock as typeof fetch});
    expect(r.source_count).toBe(3);
    expect(r.http_requests).toBe(3);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(r.status).toBe("GROUP_TRANSPORT_OK");
    expect(r.sources.find(s=>s.id==="bls")?.native_dated_24h_items).toBeNull();
    expect(r.sources.find(s=>s.id==="ofac_recent_actions")?.transport_state).toBe("HTML_HEALTH_ONLY");
    expect(r.raw_publisher_payload_persisted).toBe(false);
    expect(r.sources.every(s=>s.commercial_eligible===false&&s.signed_gro===false)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("Lithium mining contract");
    expect(JSON.stringify(r)).not.toContain("Central bank interest rate inflation");
  });
  it("does not call Atom <updated> first publication or count an edited old item as 24h news",async()=>{
    const atom=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Edited prior-event macro update</title>
        <published>2026-09-01T09:00:00Z</published>
        <updated>2026-10-12T11:55:00Z</updated></entry>
      <entry><title>Only updated, original publication unverified</title>
        <updated>2026-10-12T11:58:00Z</updated></entry>
      <entry><title>New publication</title>
        <published>2026-10-12T11:30:00Z</published>
        <updated>2026-10-12T11:50:00Z</updated></entry>
      </feed>`;
    const mock=vi.fn(async()=>new Response(atom));
    const out=await observeOperatorFreeFeedRotation({group:1,now,fetchImpl:mock as typeof fetch});
    expect(mock).toHaveBeenCalledTimes(4);
    for(const row of out.sources){
      expect(row.sampled_metadata_items).toBe(3);
      expect(row.native_dated_24h_items).toBe(1);
      expect(row.feed_items_with_explicit_publication_date).toBe(2);
      expect(row.feed_items_updated_without_publication_date).toBe(1);
      expect(row.timestamp_precision).toBe(
        "FEED_ITEM_DATE_NOT_ORIGINAL_PUBLISHER_PAGE_VALIDATION");
    }
    expect(out.raw_publisher_payload_persisted).toBe(false);
    expect(out.signed_gro_generated).toBe(false);
    expect(JSON.stringify(out)).not.toContain("Edited prior-event");
  });
  it("rejects timezone-less and vague <date> / <updated> as native original clocks",async()=>{
    const rssWithVague=`<rss version="2.0"><channel>
      <item><title>Old press item re-indexed</title><date>2026-10-12</date>
        <updated>2026-10-12T11:55:00Z</updated></item>
      <item><title>Implicit timezone date</title><pubDate>2026-10-12 11:30:00</pubDate></item>
      <item><title>Actual original RSS date</title>
        <pubDate>Mon, 12 Oct 2026 11:45:00 GMT</pubDate></item>
      </channel></rss>`;
    const out=await observeOperatorFreeFeedRotation({group:1,now,
      fetchImpl:vi.fn(async()=>new Response(rssWithVague)) as typeof fetch,
    });
    for(const row of out.sources){
      expect(row.native_dated_24h_items).toBe(1);
      expect(row.feed_items_with_explicit_publication_date).toBe(1);
      expect(row.feed_items_updated_without_publication_date).toBe(1);
    }
  });
  it("does not retry on upstream auth/rate denial, keeps group degraded",async()=>{
    const mock=vi.fn(async()=>new Response(null,{status:429}));
    const r=await observeOperatorFreeFeedRotation({group:1,now,fetchImpl:mock as typeof fetch});
    expect(mock).toHaveBeenCalledTimes(4);
    expect(r.status).toBe("GROUP_PARTIALLY_DEGRADED");
    expect(r.sources.every(s=>s.transport_state==="DENIED_OR_RATE_LIMIT")).toBe(true);
    expect(r.http_requests).toBe(4);
  });
  it("rejects placeholder markup and keeps dates as publisher feed (not original page) metadata",async()=>{
    const mock=vi.fn(async()=>new Response("<html><rss>not a feed</rss></html>"));
    const r=await observeOperatorFreeFeedRotation({group:2,now,fetchImpl:mock as typeof fetch});
    expect(r.status).toBe("GROUP_PARTIALLY_DEGRADED");
    expect(r.sources.every(s=>s.transport_state==="FORMAT_NOT_VERIFIED")).toBe(true);
    expect(r.sources.every(s=>s.native_dated_24h_items===null)).toBe(true);
  });
  it("uses the current existing 90-minute schedule, 3 staggered groups, no database writers",()=>{
    const workflow=readFileSync(".github/workflows/expanded-official-source-observation.yml","utf8");
    expect(workflow).toContain("operator-free-feed-rotation-scheduled:");
    expect(workflow).toContain("operator-free-feed-initial-acceptance:");
    expect(workflow).toContain("OPERATOR_FREE_FEED_GROUP:");
    expect(workflow).toContain("matrix:\n        source_group: [0, 1, 2]");
    expect(workflow).toContain('cron: "17 0,3,6,9,12,15,18,21 * * *"');
    expect(workflow).toContain('cron: "47 1,4,7,10,13,16,19,22 * * *"');
  });
});
