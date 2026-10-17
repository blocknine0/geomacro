import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {discoverKazakhstanOfficialArticle,auditKazakhstanWorldBankSameEvent}
 from "./audit-kazakhstan-worldbank-compact.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
const wb="https://www.worldbank.org/en/news/press-release/2026/10/16/metals-minerals-country-compacts-launch";
const kz="https://primeminister.kz/en/news/kazakhstan-joins-world-bank-global-metals-minerals-compact-39442";
const label="Kazakhstan Joins World Bank's Global Initiative for Metals and Minerals Sector Development";
const govHome='<html><body><a href="'+kz+'">'+label+'</a></body></html>';
const html=t=>'<!DOCTYPE html><html><head><meta property="article:published_time" content="2026-10-17T09:00:00Z"></head><body>'+t+'</body></html>';
const bank=html("World Bank announces Kazakhstan metals minerals compact in partnership with country governments.");
const gov=html("Kazakhstan joined the World Bank metals and minerals compact framework on 16 October 2026.");
const now=new Date("2026-10-17T11:45:00.000Z");
const mock=async(url,opts)=>{
 assert.equal(opts.redirect,"manual");
 assert.equal(opts.method,"GET");
 if(url===wb)return new Response(bank,{status:200,headers:{"content-type":"text/html"}});
 if(url==="https://primeminister.kz/en")return new Response(govHome,{status:200,headers:{"content-type":"text/html"}});
 if(url===kz)return new Response(gov,{status:200,headers:{"content-type":"text/html"}});
 throw Error("OFFICIAL_URL_NOT_MATCHED");
};
test("only exact government original article link from official homepage",()=>{
 assert.equal(discoverKazakhstanOfficialArticle(govHome),kz);
 for(const url of [
  "https://evil.example/en/news/fake-title-333",
  "http://primeminister.kz/en/news/fake-title-333",
  "https://primeminister.kz.evil.example/en/news/fake-title-333",
  "https://primeminister.kz/en/news/fake-title-333?redirect=1",
  "https://primeminister.kz/en/news/../../../admin",
 ]){
  assert.equal(discoverKazakhstanOfficialArticle('<a href="'+url+'">'+label+'</a>'),null);
 }
});
test("two first-party original byte receipts matched topic, rights still blocked",async()=>{
 const r=await auditKazakhstanWorldBankSameEvent({fetchImpl:mock,now});
 assert.equal(r.status,"TWO_OFFICIAL_ORIGINAL_LEADS_TOPIC_MATCH_RIGHTS_UNVERIFIED");
 assert.equal(r.world_bank.exact_html_sha256,sha(bank));
 assert.equal(r.kazakhstan_government.exact_html_sha256,sha(gov));
 assert.equal(r.kazakhstan_government.precise_native_publication_clock_verified,true);
 assert.equal(r.source_websites_independent_issuers_candidate,true);
 assert.equal(r.same_event_semantic_review_verified,false);
 assert.equal(r.article_specific_no_attribution_commercial_rights_verified,false);
 assert.equal(r.licensed_signed_commercial_gro,false);
 assert.equal(r.b2_requests,0);assert.equal(r.payments,0);
 assert.equal(JSON.stringify(r).includes(kz),false);
 assert.equal(JSON.stringify(r).includes(gov),false);
});
test("no government independently issued article denies same-event candidate",async()=>{
 const failed=await auditKazakhstanWorldBankSameEvent({
  now,fetchImpl:async(url,opts)=>url==="https://primeminister.kz/en"?
   new Response("<html><body>No matching Kazakhstan World Bank initiative original found.</body></html>",{
    status:200,headers:{"content-type":"text/html"}}):mock(url,opts),
 });
 assert.equal(failed.status,"KAZAKHSTAN_GOVERNMENT_ORIGINAL_ARTICLE_LINK_UNVERIFIED");
 assert.equal(failed.verified_country_category_commercial_event_count,0);
});
test("Kazakhstan government returns redirect, legal clearance remains denied",async()=>{
 const denied=await auditKazakhstanWorldBankSameEvent({now,
  fetchImpl:async(url,opts)=>url===kz?
   new Response(null,{status:302,headers:{location:"https://evil.example"}}):
   mock(url,opts),
 });
 assert.equal(denied.status,"KAZAKHSTAN_GOVERNMENT_ORIGINAL_BYTES_UNVERIFIED");
 assert.equal(denied.commercial_eligible,false);
 assert.equal(denied.b2_requests,0);
});
