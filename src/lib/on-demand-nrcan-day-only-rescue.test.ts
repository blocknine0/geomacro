import {describe,it,expect,vi} from "vitest";
import {discoverOnDemandForPrivateQualification,verifyOnDemandOriginalArticlePages}
  from "./on-demand-global-discovery.server";
import {qualifyRetrievedOnDemandEvidence} from "./on-demand-evidence-qualification.server";

const NOW=new Date("2026-10-14T11:00:00.000Z");
const RELEASE_DAY="2026-10-14";
const URL_PREFIX="https://www.canada.ca/en/natural-resources-canada/news/2026/10/";
const TOPICS=[
  ["copper","Canada strengthens copper critical minerals supply chain"],
  ["lithium","Canada advances lithium critical minerals recycling"],
  ["graphite","Canada announces graphite supply-chain investment"],
  ["rare earth","Canada strengthens rare earth processing capacity"],
  ["policy","Canada expands critical minerals supply policy"],
] as const;
const params={country_iso3:"CAN",categories:["rare_earth" as const],
  topics:["critical_minerals"],max_age_seconds:86_400};

function specimen(
  title:string,
  variant:"day"|"precise"|"stale"|"modified-only"|"mismatched-h1"|"denied"="day",
){
 const seen:string[]=[];
 const filename=title.toLowerCase().replace(/[^a-z0-9]+/gu,"-");
 const url=URL_PREFIX+filename+".html";
 const issued=variant==="stale"?"2026-09-01":RELEASE_DAY;
 const html='<html><h1>'+ (variant==="mismatched-h1"?"Unrelated government transport notice":title)+
    '</h1>'+(variant==="modified-only"
      ? '<meta property="article:modified_time" content="'+issued+'T08:00:00Z">'
      : '<meta name="dcterms.issued" content="'+issued+'">'+
        (variant==="precise"
         ? '<meta property="article:published_time" content="'+issued+'T08:00:00Z">':""))+
    '</html>';
 const feed='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>'+title+
    '</title><updated>2026-10-14T10:59:00Z</updated>'+
    '<link rel="alternate" href="'+url+'"/></entry></feed>';
 const fetchImpl=vi.fn(async(request:RequestInfo|URL):Promise<Response>=>{
  const target=String(request);seen.push(target);
  const host=new URL(target).hostname;
  if(host==="api.worldbank.org")return Response.json([{page:1},[{id:"CAN",name:"Canada"}]]);
  if(host==="api.io.canada.ca")return variant==="denied"
    ?new Response("Forbidden",{status:403}):new Response(feed,{headers:{"content-type":"application/atom+xml"}});
  if(target===url)return new Response(html,{headers:{"content-type":"text/html"}});
  if(host==="www.gov.uk")return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
  if(host==="www.minister.industry.gov.au")throw Error("TRANSPORT_UNAVAILABLE");
  if(host==="api.gdeltproject.org")return Response.json({articles:[]});
  throw Error("UNEXPECTED_FETCH");
 }) as typeof fetch;
 return {url,seen,fetchImpl};
}
describe("official Canadian undated Atom first-publication rescue in existing on-demand engine",()=>{
 it.each(TOPICS)("keeps day-only %s official policy as private, not falsely signed/chargeable",async(_kind,title)=>{
   const {url,seen,fetchImpl}=specimen(title);
   const discovered=await discoverOnDemandForPrivateQualification(params,
     {now:NOW,fetchImpl,disableDiscoveryIndex:true});
   const found=discovered.private_original_review_candidates.filter(x=>
     x.publisher_family==="canada_nrcan_original_publisher");
   expect(found).toHaveLength(1);
   expect(found[0]).toMatchObject({article_url:url,feed_item_published_at:null,
     source_native_feed_publication_date_verified:false,
     undated_atom_original_page_pending:true,paid_delivery_allowed:false,
   });
   const proof=await verifyOnDemandOriginalArticlePages(found,
     {now:NOW,fetchImpl,maxAgeSeconds:86_400});
   expect(proof).toMatchObject({attempted:1,verified:0,
     verified_candidates:[],day_only_originals:[{
       article_identity_sha256:found[0].article_identity_sha256,
       page_original_publication_day:RELEASE_DAY,original_clock_precision:"day",
       article_commercial_rights_verified:false,signed_customer_answer_verified:false,
     }]});
   const q=qualifyRetrievedOnDemandEvidence({
     search:params,discovery:discovered.discovery,originals:found,
     verifiedCountryName:discovered.private_verified_country_name,
     pageProof:proof,macroChanges:[],now:NOW,
   });
   expect(q.originals).toHaveLength(0); // no fake ISO datetime
   expect(q.commercial_delivery_eligible).toBe(false);
   expect(q.qualified_for_same_event_signing).toBe(false);
   expect(discovered.discovery.payable).toBe(false);
   expect(discovered.discovery.network_attempts).toBeLessThanOrEqual(12);
   expect(seen.filter(x=>x===url)).toHaveLength(1);
 });
 it("promotes an actually published exact first-party clock only to private review, not payment",async()=>{
   const {fetchImpl}=specimen("Canada expands lithium critical minerals processing","precise");
   const discovered=await discoverOnDemandForPrivateQualification({...params,mineral:"lithium"},
     {now:NOW,fetchImpl,disableDiscoveryIndex:true});
   const candidates=discovered.private_original_review_candidates.filter(x=>
     x.publisher_family==="canada_nrcan_original_publisher");
   expect(candidates).toHaveLength(1);
   const proof=await verifyOnDemandOriginalArticlePages(candidates,{now:NOW,fetchImpl});
   expect(proof).toMatchObject({verified:1,
     verified_candidates:[{page_original_published_at:"2026-10-14T08:00:00.000Z",
       publisher_article_page_date_verified:true,derived_commercial_rights_verified:false}]});
   const q=qualifyRetrievedOnDemandEvidence({
     search:{...params,mineral:"lithium"},
     discovery:discovered.discovery,originals:candidates,pageProof:proof,
     verifiedCountryName:discovered.private_verified_country_name,macroChanges:[],now:NOW,
   });
   expect(q.originals).toHaveLength(1);
   expect(q.originals[0].rights_status).toBe("HOLD_ITEM_LEVEL_EXCEPTIONS");
   expect(q.commercial_delivery_eligible).toBe(false);
   expect(q.qualified_for_same_event_signing).toBe(false);
 });
 it.each(["stale","modified-only","mismatched-h1","denied"] as const)(
  "rejects %s without forging issue timestamp or alternative host",async variant=>{
    const {url,fetchImpl,seen}=specimen("Canada expands graphite critical minerals mining",variant);
    const d=await discoverOnDemandForPrivateQualification({...params,mineral:"graphite"},
      {now:NOW,fetchImpl,disableDiscoveryIndex:true});
    const matches=d.private_original_review_candidates.filter(x=>
      x.publisher_family==="canada_nrcan_original_publisher");
    if(variant==="denied"){
      expect(matches).toHaveLength(0);
      expect(seen.some(s=>new URL(s).hostname==="www.canada.ca")).toBe(false);
    }else{
      expect(matches).toHaveLength(1);
      const result=await verifyOnDemandOriginalArticlePages(matches,{fetchImpl,now:NOW});
      expect(result.verified).toBe(0);
      expect(result.day_only_originals??[]).toHaveLength(0);
      expect(seen.filter(x=>x===url)).toHaveLength(1);
    }
    expect(d.discovery.payable).toBe(false);
  });
 it("rejects non-Canadian scope before any official Canada.ca original-page fetch",async()=>{
   const {url,fetchImpl,seen}=specimen("Canada strengthens copper critical minerals supply chain");
   const d=await discoverOnDemandForPrivateQualification({
     ...params,country_iso3:"CHN",
   },{now:NOW,fetchImpl,disableDiscoveryIndex:true});
   expect(d.private_original_review_candidates.some(x=>
     x.publisher_family==="canada_nrcan_original_publisher")).toBe(false);
   expect(seen).not.toContain(url);
 });
});
