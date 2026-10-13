import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  selectedPulseRotatedScorerSources,
  parsePulseRotatedOriginals,
  fetchPulseRotatedPrivateOriginals,
} from "./pulse-rotated-original-scorer.mjs";
import {privateOriginalMatchesPulse} from "./private-novel-pulse-match.mjs";

const sha=value=>createHash("sha256").update(value).digest("hex");
const SOURCE={
  uk_mod_original_defence_atom_review:{
    url:"https://www.gov.uk/government/news/defence-secretary-issues-border-security-statement",
    title:"Defence secretary issues border security statement",
    format:"atom",category:"geopolitics",
  },
  uk_hmt_original_treasury_atom_review:{
    url:"https://www.gov.uk/government/news/treasury-releases-economic-security-statement",
    title:"Treasury releases economic security statement",
    format:"atom",category:"macro",
  },
  uk_desnz_original_energy_minerals_atom_review:{
    url:"https://www.gov.uk/government/news/energy-department-updates-critical-minerals-policy",
    title:"Energy department updates critical minerals policy",
    format:"atom",category:"rare_earth",
  },
  australia_industry_minister_original_rss_review:{
    url:"https://www.minister.industry.gov.au/t-ayres/media/resources-and-minerals-security-update",
    title:"Resources and minerals security update",
    format:"rss",category:"rare_earth",
  },
};
const pub="2026-10-13T13:00:00.000Z";
function timeWithSource(category,id){
  const start=Date.parse("2026-10-13T12:00:00.000Z");
  for(let i=0;i<24;i++){
    const t=new Date(start+i*30*60*1000).toISOString();
    if(selectedPulseRotatedScorerSources(category,t).some(s=>s.id===id))
      return t;
  }
  throw Error("SOURCE_NOT_SAMPLED_IN_ROTATION");
}
function feed(source,{url,title,clock,updatedOnly=false}={}){
  const c=SOURCE[source.id];
  const stamp=clock??pub,link=url??c.url,headline=title??c.title;
  return c.format==="atom"
    ?'<feed><entry><title>'+headline+'</title><link rel="alternate" href="'+link+
      '"/><'+(updatedOnly?"updated":"published")+'>'+stamp+'</'+
      (updatedOnly?"updated":"published")+'></entry></feed>'
    :'<rss><channel><item><title>'+headline+'</title><link>'+link+
      '</link><pubDate>'+stamp+'</pubDate></item></channel></rss>';
}
function fixture(category,id){
  const checkedAt=timeWithSource(category,id);
  const source=selectedPulseRotatedScorerSources(category,checkedAt).find(x=>x.id===id);
  const article=SOURCE[id],now=new Date(Date.parse(checkedAt)+600000);
  // Use the publication timestamp relative to the checked-at real clock.
  const native=new Date(Date.parse(checkedAt)-120000).toISOString();
  const ref=sha(article.url);
  return {checkedAt,source,article,now,native,refs:new Set([ref]),
    clocks:new Map([[ref,native]])};
}

test("D1-matched MOD, Treasury, and Energy originals can reach private classifier",async()=>{
 for(const [domain,id] of [
   ["geopolitics","uk_mod_original_defence_atom_review"],
   ["macro","uk_hmt_original_treasury_atom_review"],
   ["rare_earth","uk_desnz_original_energy_minerals_atom_review"],
 ]){
   const f=fixture(domain,id);
   const xml=feed(f.source,{clock:f.native});
   const parsed=parsePulseRotatedOriginals(xml,f.source,{
     refs:f.refs,expectedClocks:f.clocks,now:f.now,
   });
   assert.equal(parsed.length,1,id);
   assert.equal(parsed[0].url,f.article.url);
   assert.equal(parsed[0].publishedAt,f.native);
   assert.equal(parsed[0].rightsVerified,false);
   assert.equal(parsed[0].commercialEligible,false);
   assert.equal(parsed[0].nativePublishedAtVerified,true);
   assert.equal(parsed[0].nativeTimeEvidence,"publisher_atom_entry_published");
   assert.equal(privateOriginalMatchesPulse(parsed[0],f.refs,
     f.now.getTime(),f.clocks),true);
   let fetches=0;
   const live=await fetchPulseRotatedPrivateOriginals({
     category:domain,checkedAt:f.checkedAt,refs:f.refs,
     expectedClocks:f.clocks,now:f.now,
     fetchImpl:async url=>{
       fetches++;
       return new Response(xml,{status:200,
         headers:{"content-type":"application/atom+xml"}});
     },
   });
   assert.ok(fetches>=1 && fetches<=2);
   assert.equal(live.length,1);
   assert.equal(live[0].url,f.article.url);
 }
});
test("private Australian minister is also selected only in its actual source-pulse rotation",async()=>{
 const f=fixture("rare_earth","australia_industry_minister_original_rss_review");
 const parsed=parsePulseRotatedOriginals(feed(f.source,{clock:f.native}),
   f.source,{refs:f.refs,expectedClocks:f.clocks,now:f.now});
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].nativeTimeEvidence,"publisher_rss_item_pubDate");
 assert.equal(parsed[0].commercialEligible,false);
});
test("no genuinely new D1 SHA means zero additional official requests",async()=>{
 const f=fixture("macro","uk_hmt_original_treasury_atom_review");
 const result=await fetchPulseRotatedPrivateOriginals({
   category:"macro",checkedAt:f.checkedAt,refs:new Set(),
   expectedClocks:new Map(),now:f.now,
   fetchImpl:()=>{throw Error("SHOULD_NEVER_FETCH")},
 });
 assert.deepEqual(result,[]);
});
test("D1 URL digest alone cannot replace exact original native publisher clock",()=>{
 const f=fixture("macro","uk_hmt_original_treasury_atom_review");
 const changed=new Date(Date.parse(f.native)+60000).toISOString();
 const parsed=parsePulseRotatedOriginals(feed(f.source,{clock:changed}),f.source,{
   refs:f.refs,expectedClocks:f.clocks,now:f.now,
 });
 assert.equal(parsed.length,0);
});
test("updated, publisher spoof, rewritten path, unrelated SHA and future dates fail closed",()=>{
 const f=fixture("geopolitics","uk_mod_original_defence_atom_review");
 const attacks=[
   feed(f.source,{clock:f.native,updatedOnly:true}),
   feed(f.source,{clock:f.native,url:f.article.url.replace("www.gov.uk","www.gov.uk.attacker.invalid")}),
   feed(f.source,{clock:f.native,url:f.article.url.replace("/government/news/","/government/organisations/")}),
   feed(f.source,{clock:f.native,url:f.article.url+"?p=1"}),
   feed(f.source,{clock:f.native,url:f.article.url+"#tracking"}),
   feed(f.source,{clock:new Date(f.now.getTime()+30000).toISOString()}),
   feed(f.source,{clock:f.native,url:f.article.url.replace("border-security","unrelated-security")}),
 ];
 for(const xml of attacks)
   assert.deepEqual(parsePulseRotatedOriginals(xml,f.source,{
     refs:f.refs,expectedClocks:f.clocks,now:f.now,
   }),[]);
});
test("oversized/XML DTD sources, denied publisher and no raw stdout cannot admit",async()=>{
 const f=fixture("macro","uk_hmt_original_treasury_atom_review");
 const original=feed(f.source,{clock:f.native});
 for(const bad of [original+"x".repeat(193*1024),
   "<!DOCTYPE feed>"+original]){
   assert.throws(()=>parsePulseRotatedOriginals(bad,f.source,{
     refs:f.refs,expectedClocks:f.clocks,now:f.now,
   }),/PRIVATE_PULSE_EXTRA_SOURCE_UNTRUSTED/);
 }
 assert.deepEqual(parsePulseRotatedOriginals(
   "<feed><entry><title>Official economic update</title><updated>"+f.native+
   "</updated></entry></feed>",f.source,{
     refs:f.refs,expectedClocks:f.clocks,now:f.now,
   }),[]);
 for(const response of [
   new Response("no",{status:403,headers:{"content-type":"application/atom+xml"}}),
   new Response("denied",{status:429,headers:{"content-type":"application/atom+xml"}}),
   new Response(original,{status:200,headers:{"content-type":"text/html"}}),
   new Response("",{status:200,headers:{"content-type":"application/atom+xml"}}),
 ]){
   const found=await fetchPulseRotatedPrivateOriginals({
     category:"macro",checkedAt:f.checkedAt,refs:f.refs,
     expectedClocks:f.clocks,now:f.now,
     fetchImpl:async()=>response.clone(),
   });
   assert.equal(found.length,0);
 }
});
