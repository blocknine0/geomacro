import {describe,expect,it,vi} from "vitest";
import {
  discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-14T09:00:00.000Z");
const pub="2026-10-14T06:00:00.000Z";
const atom=(title:string,link:string)=>
  '<feed><entry><title>'+title+'</title><published>'+pub+
  '</published><link rel="alternate" href="'+link+'"/></entry></feed>';

type Mode="australian_copper"|"treasury_fx"|"copper_search"|"fx_search";
function upstream(mode:Mode){
  const seen:string[]=[];
  const fake=vi.fn(async(target:RequestInfo|URL):Promise<Response>=>{
    const u=new URL(String(target));seen.push(u.toString());
    if(u.hostname==="api.worldbank.org"){
      if(u.pathname==="/v2/country/AUS")return Response.json([{page:1},[{id:"AUS",name:"Australia"}]]);
      if(u.pathname==="/v2/country/GBR")return Response.json([{page:1},[{id:"GBR",name:"United Kingdom"}]]);
      return Response.json([{page:1},[]]);
    }
    if(u.hostname==="www.minister.industry.gov.au")
      return new Response(mode==="australian_copper"
        ? '<rss><channel><item><title>Australian copper production investment announced</title>'+
          '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate>'+
          '<link>https://www.minister.industry.gov.au/t-ayres/media/releases/australian-copper-production</link>'+
          '</item></channel></rss>'
        : '<rss><channel></channel></rss>');
    if(u.hostname==="www.gov.uk"){
      if(u.pathname==="/api/search.json"){
        const copper=mode==="copper_search";
        return Response.json({results:[{
          title:copper?"UK copper export restriction announced":"UK foreign exchange reserves report",
          description:copper?"British copper critical mineral exports":"British foreign exchange currency reserves",
          link:copper?"/government/news/uk-copper-export-restriction":"/government/news/uk-foreign-exchange-reserves",
          public_timestamp:"2026-10-14T08:59:00Z",
        }]});
      }
      if(u.pathname.startsWith("/government/news/"))
        return new Response('<html><head><meta name="govuk:first-published-at" content="'+pub+'">'+
          '<meta name="govuk:public-updated-at" content="2026-10-14T08:59:00Z"></head></html>',
          {headers:{"content-type":"text/html"}});
      if(mode==="treasury_fx"&&u.pathname.endsWith("/hm-treasury.atom"))
        return new Response(atom("UK foreign exchange currency reserves update",
          "https://www.gov.uk/government/news/uk-foreign-exchange-reserves"));
      return new Response("<feed></feed>");
    }
    if(u.hostname==="www.federalreserve.gov"||u.hostname==="www.ecb.europa.eu")
      return new Response("<rss><channel></channel></rss>");
    throw Error("UNEXPECTED_HOST_IN_FIXTURE");
  }) as typeof fetch;
  return {seen,fake};
}

describe("original official publisher copper and FX source scope",()=>{
  it("accepts Australian dated copper article from the existing minister feed without granting commercial eligibility",async()=>{
    const {seen,fake}=upstream("australian_copper");
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"AUS",categories:["rare_earth"],topics:["critical_minerals"],
      mineral:"copper",
    },{fetchImpl:fake,now,disableDiscoveryIndex:true});
    const candidate=result.private_candidates.find(x=>x.publisher_family==="australian_industry_original_publisher");
    expect(candidate?.feed_item_published_at).toBe(pub);
    expect(candidate?.source_native_feed_publication_date_verified).toBe(true);
    expect(candidate?.first_party_article_url_verified).toBe(true);
    expect(candidate?.derived_commercial_rights_verified).toBe(false);
    expect(candidate?.paid_delivery_allowed).toBe(false);
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(seen).toHaveLength(result.discovery.network_attempts);
    expect(result.discovery.payable).toBe(false);
  });
  it("accepts a first-party UK Treasury FX reserves release without pretending annual data is current FX news",async()=>{
    const {fake}=upstream("treasury_fx");
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"GBR",categories:["macro"],topics:["fx_external_risk"],
    },{fetchImpl:fake,now,disableDiscoveryIndex:true});
    const candidate=result.private_candidates.find(x=>x.publisher_family==="uk_hmt_original_publisher");
    expect(candidate?.feed_item_published_at).toBe(pub);
    expect(candidate?.source_native_feed_publication_date_verified).toBe(true);
    expect(result.private_macro_changes).toHaveLength(0);
    expect(candidate?.paid_delivery_allowed).toBe(false);
  });
  it.each([
    ["copper_search","rare_earth","critical_minerals","copper","uk-copper-export-restriction"],
    ["fx_search","macro","fx_external_risk",null,"uk-foreign-exchange-reserves"],
  ] as const)(
    "recovers first-party %s original via Search API but requires the genuine article clock",
    async(mode,category,topic,mineral,slug)=>{
      const {seen,fake}=upstream(mode);
      const result=await discoverOnDemandForPrivateQualification({
        country_iso3:"GBR",categories:[category],topics:[topic],
        ...(mineral?{mineral}:{}),
      },{fetchImpl:fake,now,disableDiscoveryIndex:true});
      expect(seen.filter(x=>new URL(x).pathname==="/api/search.json")).toHaveLength(1);
      const candidate=result.private_original_review_candidates.find(x=>
        x.article_url.endsWith(slug));
      expect(candidate?.search_index_original_page_pending).toBe(true);
      expect(candidate?.feed_item_published_at).toBeNull();
      expect(candidate?.paid_delivery_allowed).toBe(false);
      const proof=await verifyOnDemandOriginalArticlePages(
        result.private_original_review_candidates,{fetchImpl:fake,now});
      expect(proof.verified).toBe(1);
      expect(proof.verified_candidates[0]?.page_original_published_at).toBe(pub);
      expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
      expect(result.discovery.payable).toBe(false);
      expect(result.discovery.signed_derived_intelligence_created).toBe(false);
      expect(result.discovery.supabase_requests).toBe(0);
      expect(result.discovery.b2_requests).toBe(0);
    }
  );
});
