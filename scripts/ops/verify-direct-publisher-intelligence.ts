/** Real public original GETs, no fixtures/secrets/payments/storage writes. */
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {discoverDirectPublisherForPrivateQualification,verifyOnDemandOriginalArticlePages}
  from "../../src/lib/on-demand-global-discovery.server";
import {answerFromOriginalPlan} from "../../src/lib/ask-on-demand-original.server";
import {liveStructuredData} from "../../src/lib/live-structured-on-demand.server";

const now=new Date();
let discoveryRequests=0,pageRequests=0;
const noIndexes=(url:string)=>{
 const host=new URL(url).hostname;
 if(["api.worldbank.org","api.gdeltproject.org","api.reliefweb.int","t.me","api.telegram.org"].includes(host))
  throw Error("DIRECT_PUBLISHER_NON_ORIGINAL_REQUEST");
};
const discoveryFetch:typeof fetch=(input,init)=>{
 noIndexes(String(input));
 if(++discoveryRequests>12)throw Error("DIRECT_PUBLISHER_DISCOVERY_BUDGET_EXCEEDED");
 return fetch(input,init);
};
const pageFetch:typeof fetch=(input,init)=>{
 noIndexes(String(input));
 if(++pageRequests>4)throw Error("DIRECT_PUBLISHER_PAGE_BUDGET_EXCEEDED");
 return fetch(input,init);
};
const found=await discoverDirectPublisherForPrivateQualification({country_iso3:"GBR",
 categories:["geopolitics","macro","rare_earth"],max_age_seconds:7*86400},
 {now,fetchImpl:discoveryFetch});
if(found.private_macro_changes.length||found.discovery.payable||
 found.discovery.source_probes.some(p=>/gdelt|reliefweb|world_bank/iu.test(p.family)))
 throw Error("DIRECT_PUBLISHER_PROFILE_BOUNDARY_FAILED");
const proof=await verifyOnDemandOriginalArticlePages(found.private_original_review_candidates,
 {now,maxAgeSeconds:7*86400,fetchImpl:pageFetch});
const outcomes=[];
for(const category of ["geopolitics","macro-fx","critical-minerals"] as const){
 const result=await liveStructuredData({country_iso3:"GBR",category,lookback_days:7},{
  now:()=>now,
  originalReader:(plan,options)=>answerFromOriginalPlan(plan,{...options,
   discover:async()=>found,verifyPages:async()=>proof}),
 });
 const body=result.body as Record<string,unknown>;
 if(body.chargeable!==false||body.durable_storage_written!==false||
   /https?:\/\/|article_url|article_title|publisher_family|item_scoped_summary_private/u.test(JSON.stringify(body)))
  throw Error("DIRECT_PUBLISHER_CUSTOMER_BOUNDARY_FAILED");
 outcomes.push({category,http_status:result.statusCode,derived_output:result.statusCode===200,
  customer_json_sha256:result.statusCode===200?createHash("sha256").update(JSON.stringify(body)).digest("hex"):null,
  original_publication:result.statusCode===200?body.observation_period:null});
}
const derived=outcomes.filter(x=>x.derived_output).length;
const receipt={schema:"geomacro.direct-publisher-intelligence-acceptance.v1",checked_at:now.toISOString(),
 country_iso3:"GBR",requested_categories:3,lookback_days:7,
 discovery_requests:discoveryRequests,original_page_requests:pageRequests,
 reached_original_families:found.discovery.reached_source_families,
 original_country_topic_candidates:found.private_candidates.length,
 verified_original_pages:proof.verified,derived_category_outputs:derived,outcomes,
 telegram_requests:0,discovery_index_requests:0,annual_statistics_used_as_news:false,
 raw_upstream_delivered:false,source_commercial_rights_verified:false,
 all_195_countries_fresh_coverage_verified:false,
 intelligence_storage_writes:0,settlement_attempts:0,commercial_payment_authorized:false};
await mkdir("artifacts",{recursive:true});
await writeFile("artifacts/direct-publisher-intelligence-receipt.json",JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt));
if(derived===0)throw Error("DIRECT_PUBLISHER_NO_GENUINE_DERIVED_OUTPUT");
