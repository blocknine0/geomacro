import test from "node:test";
import assert from "node:assert/strict";
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {officialWebsiteCandidateFromOsint,unverifiedWebsiteSignalFromOsint,publishPrivateOsintWebsiteSignals}
 from "./private-osint-website-bridge.mjs";

const now=Date.parse("2026-10-25T12:00:00.000Z");
const rows=[
 {source_url:"https://press.un.org/en/rss.xml",category:"geopolitics",
  title:"United Nations Security Council announces new sanctions measures",
  article_url:"https://press.un.org/en/2026/sc12345.doc.htm"},
 {source_url:"https://www.bankofcanada.ca/content_type/press-releases/feed/",category:"macro",
  title:"Bank of Canada announces monetary policy interest rate decision",
  article_url:"https://www.bankofcanada.ca/2026/10/monetary-policy-decision/"},
 {source_url:"https://www.energy.gov/rss/energygov/2193718",category:"rare_earth",
  title:"Department of Energy announces critical minerals supply program",
  article_url:"https://www.energy.gov/articles/critical-minerals-supply-program"},
].map(x=>({...x,published_at:"2026-10-25T11:40:00.000Z"}));

test("all three category observations require exact official publisher permalinks",()=>{
 for(const x of rows){
  const result=officialWebsiteCandidateFromOsint(x,now);
  assert.ok(result,x.category);assert.equal(result.category,x.category);
  assert.equal(result.articleUrl,x.article_url);
  assert.ok(result.credit.length>0);assert.equal(result.publishedAt,x.published_at);
 }
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],article_url:"https://news.google.com/articles/abc"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],category:"macro"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],source_url:"https://example.com/feed"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],published_at:"2026-10-26T11:40:00.000Z"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...rows[0],title:"Too short"},now),null);
});

test("only new derived source-credited unscored stories are written and read back",async()=>{
 const signal={id:"geopolitics-12345678",category:"geopolitics",
   status:"official_release_observed_unscored",same_event_corrob_verified:false,
   severity:null,sources_credited:["United Nations"]};
 let records=[],calls=0;
 const readAll=async()=>records;
 const fetchImpl=async(url,options)=>{
  assert.match(url,/\/v1\/website-derived-news$/u);
  assert.equal(options.method,"PUT");
  assert.equal(options.headers.Authorization,"Bearer "+"a".repeat(64));
  const body=JSON.parse(options.body);
  assert.equal(body.schema,"geomacro.website-derived-news-batch.v1");
  assert.equal(body.signals.length,1);
  records=[...records,...body.signals];calls++;
  return new Response(JSON.stringify({ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",accepted:body.signals.length,persistent_derived_only:true,chargeable:false}),{status:200});
 };
 const config={signals:[signal],controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),readAll,fetchImpl,now};
 const published=await publishPrivateOsintWebsiteSignals(config);
 assert.equal(published.new_derived_stories,1);
 assert.equal(published.journal_readback_verified,true);assert.equal(calls,1);
 const second=await publishPrivateOsintWebsiteSignals(config);
 assert.equal(second.new_derived_stories,0);assert.equal(calls,1);
 const sourcePrivate={...signal,id:"geopolitics-87654321",sources_credited:[]};
 const federal=await publishPrivateOsintWebsiteSignals({...config,signals:[sourcePrivate]});
 assert.equal(federal.new_derived_stories,1);
 await assert.rejects(publishPrivateOsintWebsiteSignals({...config,
   signals:[{...signal,status:"osint_feed_observed_unverified",sources_credited:[]}] }),/BRIDGE_SIGNAL_UNSAFE/u);
 await assert.rejects(publishPrivateOsintWebsiteSignals({...config,
   signals:[{...signal,severity:42}] }),/BRIDGE_SIGNAL_UNSAFE/u);
});

test("a claimed write without exact public readback fails closed",async()=>{
 const signal={id:"macro-12345678",category:"macro",status:"official_release_observed_unscored",
   same_event_corrob_verified:false,severity:null,sources_credited:["Bank of Canada"]};
 await assert.rejects(publishPrivateOsintWebsiteSignals({
   signals:[signal],controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),now,readAll:async()=>[],
   fetchImpl:async()=>new Response(JSON.stringify({
     ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",
     accepted:1,persistent_derived_only:true,chargeable:false}),{status:200}),
 }),/EXACT_READBACK_FAILED/u);
});

test("collector captures the original RSS permalink ephemerally while keeping private projection source-free",async()=>{
 const date=new Date(now).toUTCString();
 const xml='<?xml version="1.0"?><rss version="2.0"><channel><item>'+
 '<title>United Nations Security Council announces new sanctions measures</title>'+
 '<link>https://press.un.org/en/2026/sc12345.doc.htm</link>'+
 '<pubDate>'+date+'</pubDate></item></channel></rss>';
 const observed=[];
 const res=await collectRegisteredReusableNews({
  now:new Date(now),registry:[{id:"un_press_global",url:"https://press.un.org/en/rss.xml",
   categories:["geopolitics"],type:"rss",supported:true}],
  normalize:input=>({schema:"geomacro.reusable-news-json.v1",
   id:"news-"+"a".repeat(64),category:input.category,
   source:{publisher_name:null,original_url:null,original_published_at:input.published_at},
   delivery:{raw_article_included:false},
   usage_rights:{commercial_reuse_authorized:false}}),
  onOriginalCandidate:x=>observed.push(x),
  fetchImpl:async()=>new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}}),
 });
 assert.equal(res.items.length,1);
 assert.equal(observed.length,1);
 assert.equal(observed[0].article_url,"https://press.un.org/en/2026/sc12345.doc.htm");
 assert.equal(res.items[0].source.original_url,null);
 assert.equal(officialWebsiteCandidateFromOsint(observed[0],now)?.credit,"United Nations");
});

test("unverified native-dated source-feed observations become source-identified private-safe cards across all categories",()=>{
 const categories=["geopolitics","macro","rare_earth"];
 for(const category of categories){
  const row={
   news_id:"news-"+"c".repeat(64),category,
   source_url:"https://news.google.com/rss/search?q=energy",
   title:category==="geopolitics"?"UN leaders discuss sanctions and security measures today":
    category==="macro"?"Central bank reports inflation and monetary policy data":
    "Regional mining group discusses lithium and copper mineral production",
   published_at:"2026-10-25T11:40:00.000Z",article_url:null,
  };
  const signal=unverifiedWebsiteSignalFromOsint(row,now);
  assert.ok(signal,category);
  assert.equal(signal.status,"osint_feed_observed_unverified");
  assert.equal(signal.category,category);
  assert.equal(signal.severity,null);
  assert.equal(signal.same_event_corrob_verified,false);
  assert.equal(signal.date_precision,"exact");
  assert.match(signal.sources_credited[0],/Monitored feed: news.google.com \(aggregator; original publisher not verified\)/u);
  assert.ok(!JSON.stringify(signal).includes(row.title));
  assert.ok(!JSON.stringify(signal).includes(row.source_url));
  assert.equal(signal.geography,null);
  assert.equal(signal.development_type,"unverified OSINT feed observation");
  assert.equal(unverifiedWebsiteSignalFromOsint({...row,published_at:"2026-10-26T11:40:00.000Z"},now),null);
  assert.equal(unverifiedWebsiteSignalFromOsint({...row,news_id:"news-unsafe"},now),null);
 }
});

test("specific native-dated source reports use observed facts across three categories",()=>{
 const examples=[
  ["geopolitics","United States announced a new security policy","United States announced a new security policy across border agencies."],
  ["macro","Federal Reserve announced new monetary policy measures","Federal Reserve announced new monetary policy measures affecting lending conditions."],
  ["rare_earth","Canada announced a new critical minerals project","Canada announced a new critical minerals project to develop mineral processing."],
 ];
 for(const [category,headline,change] of examples){
  const row={news_id:"news-"+"b".repeat(64),category,
   source_url:"https://news.google.com/rss/search?q=economic",
   title:"Named actor announces new action (source report)",
   published_at:"2026-10-25T11:40:00.000Z"};
  const signal=unverifiedWebsiteSignalFromOsint(row,now,()=>({headline,change}));
  assert.ok(signal,category);
  assert.equal(signal.status,"osint_feed_observed_unverified");
  assert.equal(signal.title,"Geomacro finds "+headline);
  assert.match(signal.what_changed,/monitored source feed reports/u);
  assert.ok(!JSON.stringify(signal).includes(row.title));
  assert.equal(signal.sources_credited.length,1);
  assert.equal(signal.same_event_corrob_verified,false);
 }
});
test("unverified source observations do not claim actor from source host",()=>{
 const row={news_id:"news-"+"a".repeat(64),source_url:"https://example.gov/rss",category:"macro",
  title:"A monthly central bank update reports financial conditions across regions",
  published_at:"2026-10-25T11:40:00.000Z"};
 const derived=unverifiedWebsiteSignalFromOsint(row,now,()=>null);
 assert.ok(derived);
 assert.match(derived.sources_credited[0],/Monitored feed: example.gov/u);
 assert.match(derived.what_changed,/have not been independently verified/u);
 assert.doesNotMatch(derived.title,/example.gov/u);
});

test("source-private U.S. federal original feed candidates are admitted only at pinned permalink path",()=>{
 const federal=[
  {source_url:"https://www.whitehouse.gov/presidential-actions/feed/",
   article_url:"https://www.whitehouse.gov/presidential-actions/2026/10/adjusting-imports-of-wind-turbines-and-their-parts-and-components-into-the-united-states/",
   category:"geopolitics",title:"White House announces adjustments to U.S. import duties"},
  {source_url:"https://www.whitehouse.gov/briefings-statements/feed/",
   article_url:"https://www.whitehouse.gov/briefings-statements/2026/10/president-announces-a-new-national-security-plan/",
   category:"geopolitics",title:"U.S. President announces a new national security plan"},
 ];
 for(const row of federal){
   const result=officialWebsiteCandidateFromOsint({...row,published_at:"2026-10-25T11:40:00.000Z"},now);
   assert.ok(result,row.source_url);
   assert.equal(result.credit,null);
 }
 assert.equal(officialWebsiteCandidateFromOsint({...federal[0],
  article_url:"https://news.google.com/any",published_at:"2026-10-25T11:40:00.000Z"},now),null);
 assert.equal(officialWebsiteCandidateFromOsint({...federal[0],
  article_url:"https://www.whitehouse.gov/presidential-actions/2026/10/short/",
  published_at:"2026-10-25T11:40:00.000Z"},now),null);
 // Category routing is shared for the same original U.S. government feed;
 // later genuine-topic and actor/action filters determine publishability.
 for(const category of ["geopolitics","macro","rare_earth"]){
  const candidate=officialWebsiteCandidateFromOsint({...federal[0],
   category,published_at:"2026-10-25T11:40:00.000Z"},now);
  assert.equal(candidate?.category,category);
  assert.equal(candidate?.credit,null);
 }
});

test("genuine original releases in hours 25-72 reach website without entering private 25h intake",async()=>{
 const stamp="2026-10-23T12:01:00.000Z";
 const date=new Date(stamp).toUTCString();
 const article="https://www.whitehouse.gov/briefings-statements/2026/10/president-announces-a-new-security-plan/";
 const feed="https://www.whitehouse.gov/briefings-statements/feed/";
 const xml='<?xml version="1.0"?><rss version="2.0"><channel><item>'+
  '<title>U.S. President announces new security sanctions measures</title>'+
  '<link>'+article+'</link><pubDate>'+date+'</pubDate>'+
  '</item></channel></rss>';
 const original=[];
 const result=await collectRegisteredReusableNews({
  now:new Date(now),
  registry:[{id:"private_mesh_white_house",url:feed,
   categories:["geopolitics"],type:"rss",supported:true}],
  normalize:()=>{throw Error("private-only normalizer must not run after private 25h cutoff")},
  onOriginalCandidate:candidate=>original.push(candidate),
  fetchImpl:async()=>new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}}),
 });
 assert.equal(result.items.length,0);
 assert.equal(original.length,1);
 assert.equal(original[0].published_at,stamp);
 const admitted=officialWebsiteCandidateFromOsint(original[0],now);
 assert.ok(admitted);
 assert.equal(admitted.credit,null);
 assert.equal(admitted.articleUrl,article);
 assert.equal(admitted.category,"geopolitics");
 assert.equal(officialWebsiteCandidateFromOsint({...original[0],
  published_at:"2026-10-22T11:00:00.000Z"},now),null);
});
