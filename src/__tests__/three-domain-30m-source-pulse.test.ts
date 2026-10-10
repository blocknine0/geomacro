import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  THIRTY_MIN_PUBLISHER_PAIRS,
  select30MinPublishers,
  probe30MinThreeDomainPulse,
} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {
  EXPANDED_OFFICIAL_SOURCES,
  probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";

const NOW=new Date("2026-10-10T16:30:00.000Z");
const DOMAINS=["geopolitics","macro","rare_earth"];

function verifiedDateResponse(source: {id:string,domain:string},count=0) {
  return {
    source_id:source.id,domain:source.domain,
    publisher_reachable:true,format_valid:true,
    original_publisher_topical_30m:count,
    original_publisher_topical_90m:count+1,
    original_publisher_topical_6h:count+2,
  };
}

describe("#1827 bounded native 30-minute original-publisher intake",()=>{
  it("selects one first-party native publisher per domain each half-hour, never 778 catalog candidates",()=>{
    const pairs=select30MinPublishers(NOW);
    expect(Object.keys(pairs)).toEqual(DOMAINS);
    expect(Object.keys(THIRTY_MIN_PUBLISHER_PAIRS)).toEqual(DOMAINS);
    expect(Object.values(pairs).every(x=>x.length===2)).toBe(true);
    const next=select30MinPublishers(new Date(NOW.getTime()+30*60_000));
    for(const domain of DOMAINS) {
      expect(pairs[domain][0].id).toBe(next[domain][1].id);
      expect(pairs[domain][1].id).toBe(next[domain][0].id);
    }
  });

  it("reports real source-date topic counts without falsely claiming verified intelligence",async()=>{
    const probe=vi.fn(async (source:{id:string,domain:string})=>verifiedDateResponse(source,1));
    const x=await probe30MinThreeDomainPulse({now:NOW,probe});
    expect(probe).toHaveBeenCalledTimes(3);
    expect(x.target_poll_minutes).toBe(30);
    expect(x.schedule_guaranteed).toBe(false);
    expect(x.status).toBe("THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED");
    expect(x.actual_original_publisher_rows.map(row=>row.domain)).toEqual(DOMAINS);
    expect(x.actual_original_publisher_rows.every(row=>row.original_publisher_30m_topic_count===1)).toBe(true);
    expect(x.independently_verified_current_intelligence_count).toBe(0);
    expect(x.user_api_delivery_verified).toBe(false);
    expect(x.publisher_rights_verified).toBe(false);
    expect(x.b2_reads+x.b2_writes+x.d1_writes+x.supabase_requests+x.payments_performed).toBe(0);
    expect(x.actual_original_publisher_rows.every(row=>row.chargeable_intelligence_ready===false)).toBe(true);
  });

  it("distinguishes no-new original-publisher item from missing transport",async()=>{
    const probe=vi.fn(async(source:{id:string,domain:string})=>verifiedDateResponse(source,0));
    const r=await probe30MinThreeDomainPulse({now:NOW,probe});
    expect(r.actual_original_publisher_rows.every(row=>row.no_new_30m_original_topic_item_observed)).toBe(true);
    expect(r.status).toBe("THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED");
    expect(r.independently_verified_current_intelligence_count).toBe(0);
  });

  it("tries one same-domain alternate after a transient failure and never claims source diversity",async()=>{
    const calls:string[]=[];
    const probe=async(source:{id:string,domain:string})=>{
      calls.push(source.id);
      if(calls.length===1)return {source_id:source.id,domain:source.domain,format_valid:false,primary_http_status:503};
      return verifiedDateResponse(source,2);
    };
    const r=await probe30MinThreeDomainPulse({now:NOW,probe});
    expect(calls).toHaveLength(4);
    expect(r.actual_original_publisher_rows[0].publisher_failover_attempted).toBe(true);
    expect(r.actual_original_publisher_rows[0].event_same_subject_independent_corroboration_verified).toBe(false);
  });

  it.each([401,403,429])("does not circumvent publisher auth or throttling HTTP %s",async status=>{
    let first=true;let n=0;
    const probe=async(source:{id:string,domain:string})=>{
      n++;
      if(first){first=false;return {source_id:source.id,domain:source.domain,format_valid:false,primary_http_status:status};}
      return verifiedDateResponse(source);
    };
    const r=await probe30MinThreeDomainPulse({now:NOW,probe});
    expect(n).toBe(3);
    expect(r.status).toBe("THREE_DOMAIN_SOURCE_TRANSPORT_DEGRADED");
    expect(r.actual_original_publisher_rows[0].original_publisher_30m_topic_count).toBeNull();
    expect(r.actual_original_publisher_rows[0].publisher_failover_attempted).toBe(false);
  });

  it("computes exact 30-minute source-native pubDate windows, not 90m or fetched-at clocks",async()=>{
    const source=EXPANDED_OFFICIAL_SOURCES.find(x=>x.id==="fed_monetary_original_press_rss_review")!;
    const xml=`<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Inflation policy release</title><pubDate>Sat, 10 Oct 2026 16:10:00 GMT</pubDate>
      <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm</link></item>
      <item><title>Inflation policy release</title><pubDate>Sat, 10 Oct 2026 15:40:00 GMT</pubDate>
      <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010b.htm</link></item>
      <item><title>Inflation policy release</title><pubDate>Sat, 10 Oct 2026 14:30:00 GMT</pubDate>
      <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010c.htm</link></item>
    </channel></rss>`;
    const row=await probeExpandedSource(source,{
      now:NOW,
      fetchImpl:async()=>new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}}),
    });
    expect(row.format_valid).toBe(true);
    expect(row.original_publisher_topical_30m).toBe(1);
    expect(row.original_publisher_topical_90m).toBe(2);
    expect(row.original_publisher_topical_6h).toBe(3);
    expect(row.commercial_eligible).toBe(false);
    expect(row.current_scored_intelligence_verified).toBe(false);
  });

  it("keeps the schedule/cost boundary read-only and no paid feature bypass",()=>{
    const flow=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
    const source=readFileSync("scripts/ops/probe-30min-three-domain-pulse.mjs","utf8");
    expect(flow).toContain('cron: "12,42 * * * *"');
    expect(flow).toContain("retention-days: 2");
    // Cloudflare scoped D1 credentials are used to publish *only* compact
    // source-check status. The acquisition leg must never hold B2/Supabase,
    // commerce, Telegram or historical credentials.
    expect(flow).toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(flow).toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
    expect(flow).not.toContain("secrets.SUPABASE");
    expect(flow).not.toContain("secrets.B2_");
    expect(flow).not.toContain("secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(flow).not.toContain("d1 execute");
    expect(flow).not.toContain("B2_KEY_ID");
    expect(source).toContain("source_catalog_entries_are_not_events:true");
    expect(source).toContain("schedule_guaranteed:false");
    expect(source).toContain("user_api_delivery_verified:false");
    expect(source).toContain("if(result.status!==\"THREE_DOMAIN_ORIGINAL_PUBLISHER_TRANSPORT_OBSERVED\")");
  });
});
