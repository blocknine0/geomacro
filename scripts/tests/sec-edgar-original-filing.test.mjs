import {test} from "node:test";
import assert from "node:assert/strict";
import {
  selectSecOriginalFiling,verifySecOriginalHeader,verifySecFilingProduction,
} from "../../global-intelligence/adapters/sec-edgar-original-filing.mjs";
const now=new Date("2026-10-16T10:00:00Z");
const accession="0000320193-26-000056";
const filings={cik:320193,filings:{recent:{
  form:["8-K","10-Q","S-8"],
  accessionNumber:[accession,"0000320193-26-000020","0000320193-26-000070"],
  filingDate:["2026-09-15","2026-05-15","2026-10-10"]
}}};
const original=[
 "<SEC-DOCUMENT>"+accession+".txt : 20260915",
 "<SEC-HEADER>"+accession+".hdr.sgml : 20260915",
 "ACCESSION NUMBER:\t\t"+accession,
 "CONFORMED SUBMISSION TYPE:\t8-K",
 "FILED AS OF DATE:\t\t20260915",
 "</SEC-HEADER>",
 "<DOCUMENT>",
 "<TYPE>8-K",
 "<TEXT>private raw issuer filing text must never be output</TEXT>"
].join("\n");
test("SEC filing selection is pinned to issuer, supported forms and date",()=>{
 const x=selectSecOriginalFiling(filings,{now});
 assert.equal(x.accession,accession);
 assert.equal(x.filing_date,"2026-09-15");
 assert.equal(x.form,"8-K");
 assert.equal(x.url,"https://www.sec.gov/Archives/edgar/data/320193/"+
   accession.replaceAll("-","")+"/"+accession+".txt");
 assert.throws(()=>selectSecOriginalFiling({...filings,cik:123},{now}),/SEC_ISSUER_IDENTITY_MISMATCH/);
 assert.throws(()=>selectSecOriginalFiling({cik:320193,filings:{recent:{
   form:["8-K"],accessionNumber:[],filingDate:["2026-09-15"]}}},
   {now}),/SEC_SUBMISSIONS_SHAPE_INVALID/);
});
test("SEC native header matches form/accession/date, without raw customer exposure",()=>{
 const filing=selectSecOriginalFiling(filings,{now});
 const r=verifySecOriginalHeader(filing,original);
 assert.equal(r.original_submission_identity_verified,true);
 assert.match(r.header_sha256,/^[0-9a-f]{64}$/);
 assert.equal(r.full_document_downloaded,false);
 assert.equal(r.original_publisher_article_clock_verified,false);
 assert.equal(r.derived_country_impact_verified,false);
 assert.doesNotMatch(JSON.stringify(r),/private raw issuer filing/);
 for(const alt of [
   original.replaceAll(accession,"0000320193-26-000055"),
   original.replace("CONFORMED SUBMISSION TYPE:\t8-K","CONFORMED SUBMISSION TYPE:\t10-K"),
   original.replace("20260915\n</SEC-HEADER>","20260914\n</SEC-HEADER>"),
   "<html><body>captcha blocked</body></html>"
 ])assert.throws(()=>verifySecOriginalHeader(filing,alt));
});
test("reader sends bounded exact issuer/index and original archive range",async()=>{
 const calls=[];
 const result=await verifySecFilingProduction({now,fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(calls.length===1)return Response.json(filings);
   return new Response(original,{status:206,headers:{"content-type":"text/plain"}});
 }});
 assert.equal(calls.length,2);
 assert.equal(new URL(calls[0].url).hostname,"data.sec.gov");
 assert.equal(new URL(calls[1].url).hostname,"www.sec.gov");
 assert.equal(calls[1].opts.headers.range,"bytes=0-65535");
 assert.equal(calls[1].opts.redirect,"error");
 assert.equal(result.original_submission_identity_verified,true);
});
test("upstream denial/incomplete archive fail closed",async()=>{
 await assert.rejects(()=>verifySecFilingProduction({now,fetchImpl:async()=>new Response("no",{status:403})}),/SEC_HTTP_403/);
 let calls=0;
 await assert.rejects(()=>verifySecFilingProduction({now,fetchImpl:async()=>{
   calls++;return calls===1?Response.json(filings):new Response("<html>not a filing</html>");
 }}),/SEC_NATIVE_HEADER_UNVERIFIED/);
});
