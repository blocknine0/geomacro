import {test} from "node:test";
import assert from "node:assert/strict";
import {
  parseCsvRecords,extractPublicReference,publicReferenceReceipt,
  readPublicReference,REFERENCE_READER_IDS,
} from "../../global-intelligence/adapters/public-reference-extraction.mjs";

test("pinned source inventory has only the explicitly reviewed readers",()=>{
  assert.deepEqual([...REFERENCE_READER_IDS],
    ["ecb","bis","eurostat","bls","sec_edgar","gdacs","swpc"]);
});
test("currency and bank policy CSV use actual periods, not fetch time as publication",()=>{
  const ecb=extractPublicReference("ecb",
    "CURRENCY,TIME_PERIOD,OBS_VALUE\nUSD,2026-07-01,1.1\nUSD,2026-10-13,1.15\n");
  assert.equal(ecb.reference_period,"2026-10-13");
  assert.equal(ecb.value,1.15);
  assert.equal(ecb.original_publication_at,null);
  assert.equal(ecb.eligible_for_signed_current_news,false);
  const bis=extractPublicReference("bis",
    "TIME_PERIOD,OBS_VALUE\n2026-01,4.5\n2026-09,4.25\n");
  assert.equal(bis.reference_period,"2026-09");
  assert.equal(bis.country_iso3,"USA");
  assert.equal(bis.unit,"percent");
  assert.equal(parseCsvRecords('TIME_PERIOD,OBS_VALUE\n"2026-01","2,000"\n')[0].OBS_VALUE,"2,000");
  assert.throws(()=>parseCsvRecords('TIME_PERIOD,OBS_VALUE\n"2026-09,2.5\n'),/REFERENCE_CSV_QUOTES_INVALID/);
});
test("Eurostat uses exact DEU geographic scope and latest quarterly record",()=>{
  const x={id:["geo","time"],size:[1,2],
    dimension:{geo:{category:{index:{DE:0}}},time:{category:{index:{"2025-Q4":0,"2026-Q1":1}}}},
    value:{"0":987,"1":995}};
  const row=extractPublicReference("eurostat",x);
  assert.equal(row.country_iso3,"DEU");
  assert.equal(row.reference_period,"2026-Q1");
  assert.equal(row.value,995);
  assert.equal(row.native_original_publication_proven,false);
  const mixed={id:["geo","unreviewed","time"],size:[1,2,2],
    dimension:{...x.dimension,unreviewed:{category:{index:{a:0,b:1}}}},value:{"0":100,"1":101}};
  assert.throws(()=>extractPublicReference("eurostat",mixed),/EUROSTAT_MIXED_SCOPE/);
  const exactMulti={id:["geo","freq","s_adj","na_item","unit","time"],
    size:[2,1,2,1,1,2],
    dimension:{
      geo:{category:{index:{DE:0,FR:1}}},
      freq:{category:{index:{Q:0}}},
      s_adj:{category:{index:{SCA:0,NSA:1}}},
      na_item:{category:{index:{B1GQ:0}}},
      unit:{category:{index:{CP_MEUR:0}}},
      time:{category:{index:{"2025-Q4":0,"2026-Q1":1}}}
    },value:{"1":-999,"3":995,"7":222}};
  const onlyGermanUnadjusted=extractPublicReference("eurostat",exactMulti);
  assert.equal(onlyGermanUnadjusted.value,995);
  assert.equal(onlyGermanUnadjusted.country_iso3,"DEU");
  assert.equal(onlyGermanUnadjusted.reference_period,"2026-Q1");
});
test("BLS CPI is an index, not YoY inflation or a publication timestamp",()=>{
  const x={status:"REQUEST_SUCCEEDED",Results:{series:[{data:[
    {year:"2026",period:"M09",value:"325.9"},
    {year:"2026",period:"M08",value:"324.4"},
    {year:"2026",period:"M13",value:"327"}
  ]}]}};
  const r=extractPublicReference("bls",x);
  assert.equal(r.reference_period,"2026-09");
  assert.equal(r.value,325.9);
  assert.match(r.unit,/not percent/);
  assert.equal(r.original_publication_at,null);
});
test("SEC index cannot imply original filing downloaded, event timestamp or USA impact",()=>{
  const r=extractPublicReference("sec_edgar",{filings:{recent:{
    form:["8-K","10-K"],accessionNumber:["0000320193-26-000010","0000320193-26-000001"],
    filingDate:["2026-09-08","2026-04-01"],primaryDocument:["a.htm","b.htm"]
  }}});
  assert.equal(r.kind,"FILING_INDEX_NOT_ORIGINAL_FILING");
  assert.equal(r.country_iso3,null);
  assert.equal(r.extra.original_document_retrieved,false);
  assert.equal(r.original_publication_at,null);
});
test("global hazards and space-weather remain unattributed to any country",()=>{
  const gdacs=extractPublicReference("gdacs",{features:[
    {properties:{eventtype:"EQ"},geometry:{type:"Point",coordinates:[120,8]}}]});
  assert.equal(gdacs.country_iso3,null);
  assert.equal(gdacs.extra.affected_country_verified,false);
  const swpc=extractPublicReference("swpc",{time_tag:"2026-10-16T10:00:00Z",speed:420});
  assert.equal(swpc.country_iso3,null);
  assert.equal(swpc.original_publication_at,null);
});
test("explicitly fail closed on unknown ID, response shape, redirects and oversized body",async()=>{
  assert.throws(()=>extractPublicReference("imf",{}),/REFERENCE_SOURCE_NOT_APPROVED/);
  await assert.rejects(()=>readPublicReference("imf",{fetchImpl:async()=>{throw Error("network accessed")}}),
    /REFERENCE_SOURCE_NOT_APPROVED/);
  await assert.rejects(()=>readPublicReference("gdacs",{fetchImpl:async()=>new Response(JSON.stringify({features:[]}),{
    headers:{"content-length":"1048577"}})}),/GDACS_RSS_BODY_LIMIT/);
  await assert.rejects(()=>readPublicReference("gdacs",{fetchImpl:async()=>new Response("",{status:429})}),
    /GDACS_HTTP_429/);
});
test("production receipt is sanitized, classified, isolated, and never grants paid rights",async()=>{
  const result=await publicReferenceReceipt({now:()=>new Date("2026-10-16T10:00:00Z"),
    read:async id=>id==="bis"?(()=>{throw Error("HTTP failed https://evil?secret=test-key")})():{
      source_id:id,reference_period:"2026-09",country_iso3:"USA",
      kind:"STATISTICAL_REFERENCE",source_record_count:1,
      commercial_rights_certified:false,eligible_for_signed_current_news:false}});
  assert.equal(result.source_count,7);
  assert.equal(result.failed,1);
  assert.equal(result.extracted,6);
  assert.equal(result.supabase_requests,0);
  assert.equal(result.payments,0);
  assert.equal(result.commercial_paid_eligible,false);
  assert.doesNotMatch(JSON.stringify(result),/secret|test-key|evil/);
});

test("Eurostat network requests pin quarterly unadjusted one-country GDP scope",async()=>{
  let endpoint;
  const x={id:["geo","time"],size:[1,1],
    dimension:{geo:{category:{index:{DE:0}}},time:{category:{index:{"2026-Q2":0}}}},
    value:{"0":100}};
  const row=await readPublicReference("eurostat",{fetchImpl:async(url)=>{
    endpoint=new URL(url);
    return new Response(JSON.stringify(x),{headers:{"content-type":"application/json"}});
  }});
  assert.equal(endpoint.searchParams.get("geo"),"DE");
  assert.equal(endpoint.searchParams.get("na_item"),"B1GQ");
  assert.equal(endpoint.searchParams.get("unit"),"CP_MEUR");
  assert.equal(endpoint.searchParams.get("s_adj"),"NSA");
  assert.equal(endpoint.searchParams.get("freq"),"Q");
  assert.equal(row.reference_period,"2026-Q2");
  assert.equal(row.country_iso3,"DEU");
});


test("research-only GDACS read uses existing 7-day first-party native source, not stale year-long URL",async()=>{
 const now=new Date("2026-10-24T09:00:00Z"), urls=[];
 const row=await readPublicReference("gdacs",{now,fetchImpl:async(u,opts)=>{
  urls.push(new URL(u));
  assert.equal(opts.redirect,"error");
  return Response.json({features:[{type:"Feature",
    geometry:{type:"Point",coordinates:[70,19]},
    properties:{eventid:123456,iso3:"IND",country:"India",
      fromdate:"2026-10-24T08:00:00Z"}}]});
 }});
 assert.equal(urls.length,1);
 assert.equal(urls[0].hostname,"www.gdacs.org");
 assert.equal(urls[0].searchParams.get("fromdate"),"2026-10-17");
 assert.equal(urls[0].searchParams.get("todate"),"2026-10-24");
 assert.equal(urls[0].searchParams.get("pagesize"),"3");
 assert.equal(urls[0].searchParams.get("pagenumber"),"1");
 assert.equal(row.kind,"HAZARD_DISCOVERY_NOT_COUNTRY_VERIFIED");
 assert.equal(row.country_iso3,null);
 assert.equal(row.source_record_count,1);
 assert.equal(row.native_original_publication_proven,false);
 assert.equal(row.commercial_rights_certified,false);
 assert.equal(row.eligible_for_signed_current_news,false);
 assert.doesNotMatch(JSON.stringify(row),/123456|India|IND/);
});
test("GDACS large GeoJSON uses one same-issuer RSS, retaining no verified news or country impact",async()=>{
 const urls=[],now=new Date("2026-10-24T09:00:00Z");
 const rss='<rss version="2.0" xmlns:gdacs="http://www.gdacs.org"><channel>'+
  '<item><gdacs:eventtype>EQ</gdacs:eventtype><gdacs:eventid>123456</gdacs:eventid>'+
  '<gdacs:country>India</gdacs:country><gdacs:iso3>IND</gdacs:iso3>'+
  '<gdacs:fromdate>Sat, 24 Oct 2026 08:00:00 GMT</gdacs:fromdate>'+
  '<geo:lat>19</geo:lat><geo:long>70</geo:long></item></channel></rss>';
 const row=await readPublicReference("gdacs",{now,fetchImpl:async(u,opts)=>{
  urls.push(u);
  return urls.length===1?new Response("oversize",{headers:{"content-length":"800000"}}):
    new Response(rss);
 }});
 assert.equal(urls.length,2);
 assert.equal(urls[1],"https://data.gdacs.org/xml/rss_eq_24h.xml");
 assert.equal(row.extra.same_publisher_rss_fallback,true);
 assert.equal(row.country_iso3,null);
 assert.equal(row.source_record_count,1);
 assert.equal(row.original_publication_at,null);
 assert.equal(row.eligible_for_signed_current_news,false);
});
test("malformed GDACS events are not reclassified as an empty healthy research source",async()=>{
 let calls=0;
 await assert.rejects(readPublicReference("gdacs",{
  fetchImpl:async()=>{calls++;return Response.json({features:[{properties:{eventid:"unsafe"}}]})}
 }),/GDACS_EVENT_IDS_UNVERIFIED/);
 assert.equal(calls,1);
});

const gdacsSameIssuerRss='<rss version="2.0" xmlns:gdacs="http://www.gdacs.org"><channel>'+
 '<item><gdacs:eventtype>EQ</gdacs:eventtype><gdacs:eventid>123456</gdacs:eventid>'+
 '<gdacs:country>India</gdacs:country><gdacs:iso3>IND</gdacs:iso3>'+
 '<gdacs:fromdate>Sat, 24 Oct 2026 08:00:00 GMT</gdacs:fromdate>'+
 '<geo:lat>19</geo:lat><geo:long>70</geo:long></item></channel></rss>';
test("the research GDACS reference shares the public reader's one-time timeout recovery",async()=>{
 const now=new Date("2026-10-24T09:00:00Z");
 let calls=0;
 const row=await readPublicReference("gdacs",{now,fetchImpl:async()=>{
  calls++;
  if(calls===1)throw new DOMException("PRIVATE_PROVIDER_ERROR_DO_NOT_LOG","TimeoutError");
  return new Response(gdacsSameIssuerRss);
 }});
 assert.equal(calls,2);
 assert.equal(row.source_record_count,1);
 assert.equal(row.extra.same_publisher_rss_fallback,true);
 assert.equal(row.country_iso3,null);
 assert.equal(row.native_original_publication_proven,false);
 assert.equal(row.commercial_rights_certified,false);
 assert.doesNotMatch(JSON.stringify(row),/PRIVATE_PROVIDER_ERROR|123456|India|IND/);
});
test("research GDACS server 503 gets a single official RSS retry but denial never gets fallback",async()=>{
 const now=new Date("2026-10-24T09:00:00Z");
 let urls=[];
 const row=await readPublicReference("gdacs",{now,fetchImpl:async u=>{
  urls.push(u);
  return urls.length===1?new Response("retry",{status:503}):
   new Response(gdacsSameIssuerRss);
 }});
 assert.equal(row.source_record_count,1);
 assert.equal(urls.length,2);
 assert.equal(urls[1],"https://data.gdacs.org/xml/rss_eq_24h.xml");
 for(const status of [403,429]){
  urls=[];
  await assert.rejects(readPublicReference("gdacs",{now,fetchImpl:async u=>{
   urls.push(u);return new Response("denied",{status});
  }}),new RegExp("GDACS_HTTP_"+status));
  assert.equal(urls.length,1);
 }
});
