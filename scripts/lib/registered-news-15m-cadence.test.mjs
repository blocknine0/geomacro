import test from "node:test";
import assert from "node:assert/strict";
import {selectRegisteredNewsSources,collectRegisteredReusableNews,
 REGISTERED_NEWS_POLL_SLOT_MINUTES} from "./registered-reusable-news-source-collector.mjs";

const base=new Date("2026-10-25T00:00:00.000Z");
const cats=["geopolitics","macro","rare_earth"];
const source=(c,i)=>({id:c+"-"+i,url:"https://"+c+"-"+i+".example.org/rss",
 categories:[c],supported:true,type:"rss"});

test("five-minute source slots cover at most 24 pinned publishers/category nominally in 15 minutes",()=>{
 assert.equal(REGISTERED_NEWS_POLL_SLOT_MINUTES,5);
 const registry=cats.flatMap(c=>Array.from({length:24},(_,i)=>source(c,i)));
 const slots=[0,5,10].map(minutes=>selectRegisteredNewsSources(
   new Date(base.getTime()+minutes*60_000),registry,8));
 assert.equal(slots.length,3);
 for(const cat of cats){
   const seen=new Set(slots.flatMap(rows=>rows.filter(x=>x.categories.includes(cat)).map(x=>x.id)));
   assert.equal(seen.size,24,"missing category: "+cat);
 }
 assert.equal(slots[0].length,24);
 const bigger=cats.flatMap(c=>Array.from({length:25},(_,i)=>source(c,i)));
 const t=selectRegisteredNewsSources(base,bigger,8);
 assert.ok(t.length<=24);
});

test("bounded parallel reads never exceed six concurrent external endpoints",async()=>{
 const registry=Array.from({length:15},(_,i)=>source("macro",i));
 let active=0,peak=0,calls=0;
 const now=base;
 const rss='<rss><channel><item><title>Central bank inflation update changes foreign exchange policy</title>'+
 '<pubDate>Sun, 25 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>';
 const normalized=x=>({
   schema:"geomacro.reusable-news-json.v1",category:x.category,
   delivery:{raw_article_included:false},
   usage_rights:{commercial_reuse_authorized:false},
 });
 const result=await collectRegisteredReusableNews({now,registry,perCategory:8,normalize:normalized,
   fetchImpl:async()=>{
     calls++;active++;peak=Math.max(peak,active);
     await new Promise(resolve=>setTimeout(resolve,2));
     active--;
     return new Response(rss,{status:200,headers:{"Content-Type":"application/rss+xml"}});
   }});
 assert.equal(calls,8);
 assert.ok(peak>1 && peak<=6);
 assert.equal(result.summary.nominal_poll_slot_minutes,5);
 assert.equal(result.summary.nominal_max_category_revisit_minutes,10);
 assert.equal(result.summary.schedule_and_first_report_latency_verified,false);
 assert.equal(result.summary.source_rights_commercial_authorized,false);
 assert.equal(result.summary.original_issuer_page_verified,false);
 assert.ok(result.items.every(x=>x.delivery.raw_article_included===false));
});
