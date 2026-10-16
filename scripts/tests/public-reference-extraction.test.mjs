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
    headers:{"content-length":"1048577"}})}),/REFERENCE_RESPONSE_TOO_LARGE/);
  await assert.rejects(()=>readPublicReference("gdacs",{fetchImpl:async()=>new Response("",{status:429})}),
    /REFERENCE_HTTP_429/);
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
