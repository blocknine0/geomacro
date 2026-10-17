import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
  deduplicateOnDemandOriginalHeadlines,
  type PrivateOriginalCandidate,
} from "../lib/on-demand-global-discovery.server";

const now=new Date("2026-10-12T12:00:00Z");
const urls={
  geo:"https://www.gov.uk/government/news/china-regional-diplomatic-security-talks",
  mineral:"https://www.gov.uk/government/news/china-lithium-critical-minerals-export-policy",
};
const atom=(title:string,url:string,published="")=>
  '<feed><entry><title>'+title+'</title>'+
  (published?'<published>'+published+'</published>':'')+
  '<updated>2026-10-12T11:55:00Z</updated>'+
  '<link rel="alternate" href="'+url+'"/></entry></feed>';

function origins(published=""){
  const traffic:string[]=[];
  const fetchImpl=vi.fn(async(input:RequestInfo|URL)=>{
    const value=String(input),url=new URL(value);traffic.push(value);
    if(url.hostname==="api.worldbank.org")
      return Response.json([{page:1,total:1},[{id:"CHN",name:"China"}]]);
    if(url.hostname==="api.gdeltproject.org")return Response.json({articles:[]});
    if(url.hostname==="api.reliefweb.int")return Response.json({data:[]});
    if(url.hostname==="www.gov.uk"){
      const dbt=url.pathname.includes("department-for-business-and-trade");
      return new Response(dbt?
        atom("China lithium critical minerals export policy",urls.mineral,published):
        atom("China diplomatic security talks",urls.geo,published),{
        headers:{"content-type":"application/atom+xml"}
      });
    }
    if(url.hostname==="news.un.org" ||
       url.hostname==="www.minister.industry.gov.au")
      return new Response('<rss><channel></channel></rss>',{
        headers:{"content-type":"application/rss+xml"}
      });
    throw Error("UNEXPECTED_ISSUER");
  }) as unknown as typeof fetch;
  return {fetchImpl,traffic};
}
const query={country_iso3:"CHN",categories:["geopolitics","rare_earth"] as
 ("geopolitics"|"rare_earth")[],mineral:"lithium" as const};
describe("undated GOV.UK Atom query-time original publication rescue",()=>{
  it("keeps missing feed publication distinct from original page evidence, no retrieval/update timestamps",async()=>{
    const mock=origins();
    const proof=await discoverOnDemandForPrivateQualification(query,{
      fetchImpl:mock.fetchImpl,now});
    const candidates=proof.private_original_review_candidates;
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map(x=>x.publisher_family))).toEqual(new Set([
      "uk_fcdo_original_publisher","uk_dbt_original_publisher",
    ]));
    expect(candidates.every(x=>x.undated_atom_original_page_pending===true &&
      x.feed_item_published_at===null &&
      x.source_native_feed_publication_date_verified===false &&
      x.publisher_article_page_date_verified===false &&
      x.derived_commercial_rights_verified===false &&
      x.signed_gro_verified===false &&
      x.paid_delivery_allowed===false)).toBe(true);
    expect(proof.discovery.source_probes.filter(x=>
      x.family.startsWith("uk_")).every(x=>x.publication_clock_verified===false)).toBe(true);
    const pageFetch=vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{
      expect([urls.geo,urls.mineral]).toContain(String(url));
      expect(options?.redirect).toBe("manual");
      return new Response('<html><meta name="govuk:first-published-at" '+
        'content="2026-10-12T11:30:00+00:00"></html>',{
        headers:{"content-type":"text/html"},
      });
    }) as unknown as typeof fetch;
    const pages=await verifyOnDemandOriginalArticlePages(candidates,{fetchImpl:pageFetch,now});
    expect(pages.attempted).toBe(2);
    expect(pages.verified).toBe(2);
    expect(pageFetch).toHaveBeenCalledTimes(2);
    expect(pages.verified_candidates.every(x=>x.publisher_article_page_date_verified &&
      x.page_original_published_at==="2026-10-12T11:30:00.000Z" &&
      x.source_native_feed_publication_date_verified===false &&
      x.independent_same_event_verified===false &&
      x.derived_commercial_rights_verified===false &&
      x.signed_gro_verified===false &&
      x.paid_delivery_allowed===false)).toBe(true);
    const publicProof=JSON.stringify(proof.discovery);
    expect(publicProof).not.toContain(urls.geo);
    expect(publicProof).not.toContain(urls.mineral);
  });

  it("never rescues a stale explicit <published> via its fresh <updated> clock",async()=>{
    const p=await discoverOnDemandForPrivateQualification(query,{
      fetchImpl:origins("2026-10-01T12:00:00Z").fetchImpl,now,
    });
    expect(p.private_original_review_candidates).toHaveLength(0);
    const pageFetch=vi.fn();
    expect(await verifyOnDemandOriginalArticlePages(
      p.private_original_review_candidates,{fetchImpl:pageFetch as typeof fetch,now})
    ).toEqual({attempted:0,verified:0,verified_candidates:[]});
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it("fails closed on undated source copy or forged receipt from a non-GOV.UK issuer",async()=>{
    const u:PrivateOriginalCandidate={
      domain:"geopolitics",publisher_family:"un_news_original_publisher",
      article_url:"https://news.un.org/en/story/2026/10/1150000",
      article_title:"China ceasefire security updates",
      feed_item_published_at:null,undated_atom_original_page_pending:true,
      article_identity_sha256:createHash("sha256")
        .update("un_news_original_publisher|https://news.un.org/en/story/2026/10/1150000").digest("hex"),
      first_party_article_url_verified:true,
      source_native_feed_publication_date_verified:false,
      publisher_article_page_date_verified:false,
      independent_same_event_verified:false,
      derived_commercial_rights_verified:false,
      score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
    };
    const d=deduplicateOnDemandOriginalHeadlines([u]);
    expect(d.original_review_candidates).toEqual([]);
    const fetchImpl=vi.fn();
    const r=await verifyOnDemandOriginalArticlePages([u],{
      fetchImpl:fetchImpl as typeof fetch,now});
    expect(r.attempted).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not claim fresh event if original GOV.UK page only has an updated clock",async()=>{
    const p=await discoverOnDemandForPrivateQualification(query,{
      fetchImpl:origins().fetchImpl,now,
    });
    const pageFetch=vi.fn(async()=>new Response(
      '<html><meta name="govuk:public-updated-at" content="2026-10-12T11:58:00Z"></html>',{
      headers:{"content-type":"text/html"},
    })) as unknown as typeof fetch;
    const result=await verifyOnDemandOriginalArticlePages(
      p.private_original_review_candidates,{fetchImpl:pageFetch,now});
    expect(result.attempted).toBe(2);
    expect(result.verified).toBe(0);
  });
});
