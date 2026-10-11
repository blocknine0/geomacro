import {describe,expect,it,vi} from "vitest";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {probe30MinThreeDomainPulse} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {projectSourcePulseForD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const NOW=new Date("2026-10-11T15:00:00Z");
const gov=EXPANDED_OFFICIAL_SOURCES.find(
  (x:{id:string})=>x.id==="uk_fcdo_original_foreign_policy_atom_review")!;
const fed=EXPANDED_OFFICIAL_SOURCES.find(
  (x:{id:string})=>x.id==="fed_monetary_original_press_rss_review")!;
const govUrl=(id:string)=>"https://www.gov.uk/government/news/"+id;
const entry=(id:string,date:string|null,url=govUrl(id))=>
  `<entry><title>Foreign office policy update ${id}</title>`+
  (date===null?"<updated>2026-10-11T15:00:00Z</updated>":
    `<published>${date}</published>`)+
  `<link rel="alternate" href="${url}"/></entry>`;
const atom=(body:string)=>`<?xml version="1.0"?><feed>${body}</feed>`;
function fixtureResponse(body:string,mime:string){
  return vi.fn(async()=>new Response(body,{status:200,headers:{"content-type":mime}}));
}
describe("#2041 publisher-origin item rejection diagnostics",()=>{
  it("reveals whether an HTTP-200 Atom feed has missing native dates, future clocks, rejected origin links or older history",async()=>{
    const xml=atom(
      entry("valid","2026-10-11T14:45:00Z")+
      entry("missing",null)+
      entry("future","2026-10-11T16:00:00Z")+
      entry("spoof","2026-10-11T14:35:00Z",
        "https://untrusted.example/government/news/spoof")+
      entry("old","2026-09-21T14:00:00Z")
    );
    const x=await probeExpandedSource(gov,{
      now:NOW,fetchImpl:fixtureResponse(xml,"application/atom+xml"),
      openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(x.primary_http_status).toBe(200);
    expect(x.format_valid).toBe(true);
    expect(x.source_native_release_items).toBe(2);
    expect(x.source_native_24h_release_items).toBe(1);
    expect(x.source_native_7d_release_items).toBe(1);
    expect(x.source_item_provenance_diagnostics).toEqual({
      entries_parsed:5,
      item_native_published_missing:1,
      item_native_published_invalid_or_future:1,
      original_article_link_rejected:1,
      accepted_first_party_older_than_7d:1,
      accepted_first_party_native_dated:2,
    });
    expect(x.private_original_article_candidates).toHaveLength(1);
    expect(JSON.stringify(x.source_item_provenance_diagnostics))
      .not.toContain("https:");
    expect(x.current_scored_intelligence_verified).toBe(false);
    expect(x.commercial_eligible).toBe(false);
  });
  it("reports RSS native clock absence and rejects feed index as an original article",async()=>{
    const item=(date:string|undefined,url:string)=>`<item><title>Monetary statement</title>`+
      (date===undefined?"":`<pubDate>${date}</pubDate>`)+
      `<link>${url}</link></item>`;
    const xml=`<?xml version="1.0"?><rss><channel>`+
      item("Sun, 11 Oct 2026 14:30:00 GMT",
        "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm")+
      item(undefined,"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011b.htm")+
      item("Sun, 11 Oct 2026 14:30:00 GMT","https://www.federalreserve.gov/feeds/press_all.xml")+
      `</channel></rss>`;
    const result=await probeExpandedSource(fed,{
      now:NOW,fetchImpl:fixtureResponse(xml,"application/rss+xml"),
      openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(result.source_native_24h_release_items).toBe(1);
    expect(result.source_item_provenance_diagnostics).toEqual({
      entries_parsed:3,
      item_native_published_missing:1,
      item_native_published_invalid_or_future:0,
      original_article_link_rejected:1,
      accepted_first_party_older_than_7d:0,
      accepted_first_party_native_dated:1,
    });
    expect(result.private_original_article_candidates).toHaveLength(1);
    expect(result.current_scored_intelligence_verified).toBe(false);
  });
  it("distinguishes truly empty feed from a valid feed with zero accepted original articles",async()=>{
    const empty=await probeExpandedSource(gov,{
      now:NOW,fetchImpl:fixtureResponse(atom(""),"application/atom+xml"),
      openDiscovery:true,
    });
    const undated=await probeExpandedSource(gov,{
      now:NOW,fetchImpl:fixtureResponse(atom(
        entry("no-original-published-clock",null)
      ),"application/atom+xml"),
      openDiscovery:true,
    });
    expect(empty.source_item_provenance_diagnostics?.entries_parsed).toBe(0);
    expect(undated.source_item_provenance_diagnostics?.entries_parsed).toBe(1);
    expect(undated.source_item_provenance_diagnostics?.item_native_published_missing).toBe(1);
    expect(empty.source_native_24h_release_items).toBe(0);
    expect(undated.source_native_24h_release_items).toBe(0);
    expect(undated.commercial_rights_verified).toBe(false);
  });
  it("carries numeric issuer provenance into D1 with read-only no-charge source observation",async()=>{
    const probe=vi.fn(async(source:{id:string;domain:string})=>({
      source_id:source.id,domain:source.domain,
      publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,
      original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,
      original_publisher_open_24h_count:0,
      source_native_7d_release_items:3,
      source_item_provenance_diagnostics:{
        entries_parsed:8,item_native_published_missing:7,
        item_native_published_invalid_or_future:0,
        original_article_link_rejected:1,
        accepted_first_party_older_than_7d:0,
        accepted_first_party_native_dated:0,
      },
      private_original_article_candidates:[],
    }));
    const result=await probe30MinThreeDomainPulse({now:NOW,probe});
    const derived=projectSourcePulseForD1(result);
    expect(derived).toHaveLength(3);
    for(const row of derived){
      expect(row.metadata.source_item_provenance_diagnostics).toHaveLength(2);
      expect(row.metadata.source_item_provenance_diagnostics[0].entries_parsed).toBe(8);
      expect(row.metadata.source_item_provenance_diagnostics[0].item_native_published_missing).toBe(7);
      expect(row.metadata.source_item_provenance_diagnostics[0].original_article_link_rejected).toBe(1);
      expect(row.metadata.commercial_eligible).toBe(false);
    }
    expect(result.source_catalog_entries_are_not_events).toBe(true);
    expect(result.independently_verified_current_intelligence_count).toBe(0);
    expect(result.payments_performed).toBe(0);
    expect(result.supabase_requests).toBe(0);
  });
});
