import {describe,it,expect,vi} from "vitest";
import {discoverOnDemandForPrivateQualification,verifyOnDemandOriginalArticlePages}
  from "./on-demand-global-discovery.server";
import {qualifyRetrievedOnDemandEvidence}
  from "./on-demand-evidence-qualification.server";

const NOW=new Date("2026-10-14T12:00:00Z");
const ARTICLE="https://www.canada.ca/en/natural-resources-canada/news/2026/10/canada-critical-minerals-lithium-policy.html";
const TITLE="Canada announces lithium critical minerals supply policy";
const RSS='<feed><entry><title>'+TITLE+'</title>'+
 '<published>2026-10-14T08:00:00Z</published>'+
 '<link rel="alternate" href="'+ARTICLE+'"/></entry></feed>';
function fixtures(variant:"real"|"unrelated"|"stale"|"denied"="real") {
  const urls:string[]=[];
  const fetchImpl=vi.fn(async(target:RequestInfo|URL):Promise<Response>=>{
    const url=new URL(String(target));urls.push(url.href);
    if(url.hostname==="api.worldbank.org" && url.pathname==="/v2/country/CAN")
      return Response.json([{page:1},[{id:"CAN",name:"Canada"}]]);
    if(url.hostname==="api.io.canada.ca"){
      if(variant==="denied")return new Response("denied",{status:403});
      const topic=variant==="unrelated"?"Canada announces international sailing competition":TITLE;
      const day=variant==="stale"?"2026-09-01T08:00:00Z":"2026-10-14T08:00:00Z";
      return new Response('<feed><entry><title>'+topic+'</title><published>'+day+
       '</published><link rel="alternate" href="'+ARTICLE+'"/></entry></feed>',
       {headers:{"content-type":"application/atom+xml"}});
    }
    if(url.href===ARTICLE)return new Response(
      '<html><h1>'+TITLE+'</h1><meta name="dcterms.issued" content="2026-10-14">'+
      '<meta property="article:published_time" content="2026-10-14T08:00:00Z"></html>',
      {headers:{"content-type":"text/html"}});
    if(url.hostname==="www.gov.uk")return new Response("<feed></feed>",
      {headers:{"content-type":"application/atom+xml"}});
    if(url.hostname==="www.minister.industry.gov.au")throw Error("UNAVAILABLE");
    if(url.hostname==="api.gdeltproject.org")return Response.json({articles:[]});
    throw Error("UNEXPECTED_SOURCE");
  }) as typeof fetch;
  return {fetchImpl,urls};
}
describe("reuse existing original NRCAN newsroom connector in canonical mineral engine",()=>{
 it("recovers a true source-native-dated Canadian lithium announcement, verifies same article page and holds signing",async()=>{
  const {fetchImpl,urls}=fixtures();
  const input={country_iso3:"CAN",categories:["rare_earth" as const],
    topics:["critical_minerals"],mineral:"lithium" as const,max_age_seconds:86_400};
  const proof=await discoverOnDemandForPrivateQualification(input,
    {fetchImpl,now:NOW,disableDiscoveryIndex:true});
  const originals=proof.private_candidates.filter(x=>x.publisher_family==="canada_nrcan_original_publisher");
  expect(originals).toHaveLength(1);
  expect(originals[0]).toMatchObject({
   article_url:ARTICLE,feed_item_published_at:"2026-10-14T08:00:00.000Z",
   source_native_feed_publication_date_verified:true,
   first_party_article_url_verified:true,paid_delivery_allowed:false,
   derived_commercial_rights_verified:false,signed_gro_verified:false,
  });
  const page=await verifyOnDemandOriginalArticlePages(originals,
    {fetchImpl,now:NOW,maxAgeSeconds:86_400});
  expect(page.verified).toBe(1);
  expect(page.verified_candidates[0].page_original_published_at)
    .toBe("2026-10-14T08:00:00.000Z");
  const qualified=qualifyRetrievedOnDemandEvidence({
    search:input,discovery:proof.discovery,originals,
    verifiedCountryName:proof.private_verified_country_name,pageProof:page,
    macroChanges:[],now:NOW,
  });
  expect(qualified.disposition).toBe("EVIDENCE_IDENTIFIED_REVIEW_PENDING");
  expect(qualified.originals).toHaveLength(1);
  expect(qualified.originals[0]).toMatchObject({
    rights_status:"HOLD_ITEM_LEVEL_EXCEPTIONS",
    original_clock_basis:"VERIFIED_ORIGINAL_PAGE",
    article_commercial_rights_verified:false,
    independent_same_event_verified:false,
  });
  expect(qualified.commercial_delivery_eligible).toBe(false);
  expect(qualified.qualified_for_same_event_signing).toBe(false);
  expect(proof.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(proof.discovery.payable).toBe(false);
  expect(proof.discovery.supabase_requests).toBe(0);
  expect(proof.discovery.b2_requests).toBe(0);
  expect(urls.filter(x=>x.startsWith("https://api.io.canada.ca/"))).toHaveLength(1);
  expect(urls.filter(x=>x===ARTICLE)).toHaveLength(1);
 });
 it.each(["unrelated","stale","denied"] as const)(
  "rejects non-qualifying Canadian official event on %s without payment",async variant=>{
   const {fetchImpl,urls}=fixtures(variant);
   const proof=await discoverOnDemandForPrivateQualification({
     country_iso3:"CAN",categories:["rare_earth"],topics:["critical_minerals"],
     mineral:"lithium",max_age_seconds:86_400,
   },{fetchImpl,now:NOW,disableDiscoveryIndex:true});
   expect(proof.private_candidates.some(x=>
     x.publisher_family==="canada_nrcan_original_publisher")).toBe(false);
   expect(proof.discovery.payable).toBe(false);
   expect(proof.discovery.settlement_attempted).toBe(false);
   expect(urls.filter(x=>x===ARTICLE)).toHaveLength(0);
  });
});
