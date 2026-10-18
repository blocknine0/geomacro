/** Bounded genuine Canada original -> unsigned day-aware observation check. */
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {discoverDirectPublisherForPrivateQualification,verifyOnDemandOriginalArticlePages}
  from "../../src/lib/on-demand-global-discovery.server";
import {answerFromOriginalPlan} from "../../src/lib/ask-on-demand-original.server";
import {liveStructuredData} from "../../src/lib/live-structured-on-demand.server";
import {conservativeDayReleaseMs} from "../../src/lib/stateless-intelligence-model";

const now=new Date();let discoveryRequests=0,pageRequests=0;
const allowed=new Set(["www.gov.uk","news.un.org","www.federalreserve.gov","www.ecb.europa.eu",
 "www.minister.industry.gov.au","api.io.canada.ca","www.canada.ca","press.un.org",
 "www.bis.org","www.boj.or.jp","www.iea.org","www.bankofcanada.ca","news.gov.bc.ca"]);
const checkedFetch=(phase:"discovery"|"page"):typeof fetch=>(input,init)=>{
 const u=new URL(String(input));
 if(u.protocol!=="https:"||!allowed.has(u.hostname)||u.username||u.password||u.port||
   (init?.method??"GET")!=="GET"||init?.redirect!=="manual")
  throw Error("CANADA_OBSERVATION_NON_ORIGINAL_REQUEST");
 if(phase==="discovery"?++discoveryRequests>12:++pageRequests>4)
  throw Error("CANADA_OBSERVATION_REQUEST_BUDGET_EXCEEDED");
 return fetch(input,init);
};
const found=await discoverDirectPublisherForPrivateQualification({country_iso3:"CAN",
 categories:["rare_earth"],topics:["critical_minerals"],max_age_seconds:7*86400},
 {now,fetchImpl:checkedFetch("discovery")});
const originals=found.private_original_review_candidates.filter(x=>
 x.publisher_family==="canada_nrcan_original_publisher");
const proof=await verifyOnDemandOriginalArticlePages(originals,
 {now,maxAgeSeconds:7*86400,fetchImpl:checkedFetch("page")});
const result=await liveStructuredData({country_iso3:"CAN",category:"critical-minerals",lookback_days:7},{
 now:()=>now,originalReader:(plan,options)=>answerFromOriginalPlan(plan,{...options,
  discover:async()=>({...found,private_candidates:originals}),verifyPages:async()=>proof}),
});
const body=result.body as Record<string,unknown>;
const eligibleDays=(proof.day_only_originals??[]).filter(x=>{
 const available=conservativeDayReleaseMs(x.page_original_publication_day);
 return available!==null&&available<=now.getTime();
});
if(body.chargeable!==false||body.durable_storage_written!==false||
 /https?:\/\/|article_url|article_title|publisher_family|item_scoped_summary_private/u.test(JSON.stringify(body)))
 throw Error("CANADA_OBSERVATION_CUSTOMER_BOUNDARY_FAILED");
if(eligibleDays.length>0&&result.statusCode!==200)
 throw Error("VERIFIED_ELIGIBLE_DAY_WAS_DROPPED");
if(result.statusCode===200&&body.original_date_precision==="day"&&
 (body.original_publication_time_verified!==false||
  body.clock_semantics!=="original_publication_day"||
  !/^\d{4}-\d{2}-\d{2}$/u.test(String(body.observation_period))))
 throw Error("CALENDAR_DAY_WAS_REPLACED_BY_INVENTED_INSTANT");
const receipt={schema:"geomacro.direct-canada-day-observation-acceptance.v1",checked_at:now.toISOString(),
 country_iso3:"CAN",category:"critical-minerals",lookback_days:7,
 discovery_requests:discoveryRequests,original_page_requests:pageRequests,
 source_candidates:originals.length,exact_originals:proof.verified,
 calendar_day_originals:proof.day_only_originals?.length??0,conservatively_eligible_days:eligibleDays.length,
 http_status:result.statusCode,derived_output:result.statusCode===200,
 original_publication:body.observation_period??null,date_precision:body.original_date_precision??null,
 customer_json_sha256:result.statusCode===200?createHash("sha256").update(JSON.stringify(body)).digest("hex"):null,
 raw_upstream_delivered:false,intelligence_storage_writes:0,settlement_attempts:0,
 source_commercial_rights_verified:false,signed_customer_delivery:false,
 all_country_coverage_verified:false};
await mkdir("artifacts",{recursive:true});
await writeFile("artifacts/direct-canada-day-observation-receipt.json",JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt));
