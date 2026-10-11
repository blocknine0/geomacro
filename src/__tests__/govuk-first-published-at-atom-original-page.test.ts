import {describe,expect,it,vi} from "vitest";
import {
  verifiedPublisherPageDate,fetchVerifiedPublisherPageDate,
} from "../../scripts/lib/official-original-article-date.mjs";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";

const NOW=new Date("2026-10-11T18:00:00Z");
const dbt=EXPANDED_OFFICIAL_SOURCES.find(
  (x:{id:string})=>x.id==="uk_dbt_critical_minerals_atom_pending_review")!;
const article="https://www.gov.uk/government/publications/uk-critical-minerals-supply-review";
const feed='<feed><entry><title>UK government publishes critical mineral supply assessment</title>'+
  '<updated>2026-10-11T17:58:00Z</updated>'+
  '<link rel="alternate" href="'+article+'"/></entry></feed>';
const page='<html><head>'+
  '<meta name="govuk:first-published-at" content="2026-10-11T17:30:00+00:00">'+
  '<meta name="govuk:public-updated-at" content="2026-10-11T17:58:00+00:00">'+
  '</head><body>Official first party public page</body></html>';
const http=(body:string,mime:string)=>new Response(body,{
  status:200,headers:{"content-type":mime},
});
describe("#2041 UK FCDO/DBT source-original publication clocks",()=>{
  it("uses GOV.UK first-published-at as original, explicitly excluding modified clocks",()=>{
    expect(verifiedPublisherPageDate(page,NOW)).toBe("2026-10-11T17:30:00.000Z");
    expect(verifiedPublisherPageDate(
      '<meta name="govuk:updated-at" content="2026-10-11T17:30:00+00:00">',NOW))
      .toBeNull();
    expect(verifiedPublisherPageDate(
      '<meta name="govuk:public-updated-at" content="2026-10-11T17:30:00+00:00">',NOW))
      .toBeNull();
    expect(verifiedPublisherPageDate(page.replace("17:30:00+00:00","2026-10-11T17:30:00"),NOW))
      .toBeNull();
  });
  it("rejects conflicting original clocks and a future first-published clock",()=>{
    expect(verifiedPublisherPageDate(page+
      '<meta property="article:published_time" content="2026-10-11T15:00:00Z">',NOW))
      .toBeNull();
    expect(verifiedPublisherPageDate(
      '<meta name="govuk:first-published-at" content="2026-10-12T17:30:00+00:00">',NOW))
      .toBeNull();
  });
  it("accepts fixed GOV.UK publications page date for private Atom original discovery",async()=>{
    const fetchImpl=vi.fn(async(url:string)=>{
      if(url===dbt.url)return http(feed,"application/atom+xml");
      if(url===article)return http(page,"text/html");
      throw Error("UNEXPECTED_UPSTREAM_URL");
    });
    const result=await probeExpandedSource(dbt,{
      now:NOW,fetchImpl,openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.source_item_provenance_diagnostics.item_native_published_missing).toBe(1);
    expect(result.undated_atom_article_link_candidates).toBe(1);
    expect(result.first_party_original_page_probe_codes).toMatchObject({
      PRECISE_PUBLICATION_VERIFIED:1,
    });
    expect(result.original_page_precise_date_24h).toBe(1);
    expect(result.private_original_article_candidates).toHaveLength(1);
    expect(result.private_original_article_candidates[0].native_published_at)
      .toBe("2026-10-11T17:30:00.000Z");
    expect(result.commercial_eligible).toBe(false);
    expect(result.current_scored_intelligence_verified).toBe(false);
  });
  it("never follows off-host, query-bearing, or unapproved government URLs",async()=>{
    for(const url of [
      "https://evil.example/government/publications/uk-critical-minerals-supply-review",
      article+"?download=1",
      article+"#part",
      "https://www.gov.uk/government",
    ]){
      const code={};
      const found=await fetchVerifiedPublisherPageDate(url,"rare_earth",{
        now:NOW,
        fetchImpl:async()=>{throw Error("MUST_NOT_FETCH");},
        diagnostics:code,
      });
      expect(found).toBeNull();
      expect(code).toMatchObject({code:"URL_UNAPPROVED"});
    }
  });
});