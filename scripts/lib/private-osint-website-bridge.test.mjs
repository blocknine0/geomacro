import test from "node:test";
import assert from "node:assert/strict";
import {collectRegisteredReusableNews} from "./registered-reusable-news-source-collector.mjs";
import {officialWebsiteCandidateFromOsint,unverifiedWebsiteSignalFromOsint,publishPrivateOsintWebsiteSignals,
 privateWebsiteRetentionPriority,privateWebsiteRetentionNewestFirst} from "./private-osint-website-bridge.mjs";

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
   title:"Geomacro finds United Nations security diplomacy developments",
   what_changed:"An official publisher issued a dated security and diplomacy update. Effects require separate evidence.",
   why_it_matters:"This official publication may inform diplomatic exposure, but it does not establish an independently verified event or impact.",
   topic:"security and diplomacy",geography:null,development_type:"policy update",
   published_at:"2026-10-25T11:40:00.000Z",date_precision:"exact",observed_release_count:1,
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
  assert.ok([0,1].includes(body.signals.length));
  records=[...records,...body.signals];calls++;
  return new Response(JSON.stringify({ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",accepted:body.signals.length,persistent_derived_only:true,chargeable:false}),{status:200});
 };
 const config={signals:[signal],controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),readAll,fetchImpl,now};
 const published=await publishPrivateOsintWebsiteSignals(config);
 assert.equal(published.new_derived_stories,1);
 assert.equal(published.journal_readback_verified,true);assert.equal(calls,2);
 const second=await publishPrivateOsintWebsiteSignals(config);
 assert.equal(second.new_derived_stories,0);assert.equal(calls,2);
 const sourcePrivate={...signal,id:"geopolitics-87654321",sources_credited:[]};
 const federal=await publishPrivateOsintWebsiteSignals({...config,signals:[sourcePrivate]});
 assert.equal(federal.new_derived_stories,1);
 await assert.rejects(publishPrivateOsintWebsiteSignals({...config,
   signals:[{...signal,status:"osint_feed_observed_unverified",sources_credited:[]}] }),/BRIDGE_SIGNAL_UNSAFE/u);
 await assert.rejects(publishPrivateOsintWebsiteSignals({...config,
   signals:[{...signal,severity:42}] }),/BRIDGE_SIGNAL_UNSAFE/u);
});

test("does not publish news older than an already full 600-row D1 newsroom",async()=>{
 const nowMs=Date.parse("2026-10-25T12:00:00.000Z");
 const retained=Array.from({length:600},(_,i)=>({
  id:"geopolitics-"+String(i).padStart(8,"0"),
   status:"official_release_observed_unscored",
  published_at:new Date(nowMs-i*60000).toISOString(),
 }));
 const candidate={id:"macro-12345678",category:"macro",
   title:"Geomacro finds official monetary policy developments",
   what_changed:"An official publisher issued a dated monetary policy update. Effects need separately checked evidence.",
   why_it_matters:"This official publication may inform financing conditions, but it does not prove a rate change or market outcome.",
   topic:"monetary policy",geography:null,development_type:"policy update",
   published_at:new Date(nowMs-36*3600000).toISOString(),date_precision:"exact",observed_release_count:1,
   status:"official_release_observed_unscored",same_event_corrob_verified:false,
   severity:null,sources_credited:["Federal Reserve Board"]};
 const result=await publishPrivateOsintWebsiteSignals({
   signals:[candidate],
   controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),now:nowMs,
   readAll:async()=>retained,
   fetchImpl:async()=>{throw Error("AN_EVICTED_STORY_MUST_NOT_BE_POSTED")},
 });
 assert.equal(result.candidates,1);
 assert.equal(result.new_derived_stories,0);
 assert.equal(result.deferred_unpublished,1);
 assert.equal(result.journal_readback_verified,true);
});
test("concurrent writer newest-600 eviction counts as nonvisible, not false D1 failure",async()=>{
 const nowMs=Date.parse("2026-10-25T12:00:00.000Z");
 const candidate={id:"macro-12345678",category:"macro",
   title:"Geomacro finds official monetary policy developments",
   what_changed:"An official publisher issued a dated monetary policy update. Effects need separately checked evidence.",
   why_it_matters:"This official publication may inform financing conditions, but it does not prove a rate change or market outcome.",
   topic:"monetary policy",geography:null,development_type:"policy update",
   published_at:new Date(nowMs-36*3600000).toISOString(),date_precision:"exact",observed_release_count:1,
   status:"official_release_observed_unscored",same_event_corrob_verified:false,
   severity:null,sources_credited:["Federal Reserve Board"]};
 let calls=0;
 const retained=Array.from({length:600},(_,i)=>({
  id:"geopolitics-"+String(i).padStart(8,"0"),
   status:"official_release_observed_unscored",
  published_at:new Date(nowMs-i*60000).toISOString(),
 }));
 const result=await publishPrivateOsintWebsiteSignals({
  signals:[candidate],
  controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
  controlToken:"a".repeat(64),now:nowMs,
  readAll:async()=>calls?retained:[],
  fetchImpl:async(_url,options)=>{
    const count=JSON.parse(options.body).signals.length;
    calls++;
    return new Response(JSON.stringify({
      ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",
      accepted:count,persistent_derived_only:true,chargeable:false}),{status:200});
  },
 });
 assert.equal(calls,2);
 assert.equal(result.new_derived_stories,0);
 assert.equal(result.d1_quota_evictions,1);
 assert.equal(result.journal_readback_verified,true);
});
test("a claimed write without exact public readback fails closed",async()=>{
 const signal={id:"macro-12345678",category:"macro",
    title:"Geomacro finds official inflation and monetary policy developments",
    what_changed:"An official publisher issued a dated monetary policy update. Effects need separately checked evidence.",
    why_it_matters:"This official publication may inform financing conditions, but it does not prove a rate change or market outcome.",
    topic:"monetary policy",geography:null,development_type:"policy update",
    published_at:"2026-10-25T11:40:00.000Z",date_precision:"exact",observed_release_count:1,
    status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null,sources_credited:["Bank of Canada"]};
 await assert.rejects(publishPrivateOsintWebsiteSignals({
   signals:[signal],controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   controlToken:"a".repeat(64),now,readAll:async()=>[],
   fetchImpl:async(_url,options)=>new Response(JSON.stringify({
     ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",
     accepted:JSON.parse(options.body).signals.length,persistent_derived_only:true,chargeable:false}),{status:200}),
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

test("concrete OSINT displaces generic feed candidates without growing the 600-row D1 cap",async()=>{
 const at=Date.parse("2026-10-25T12:00:00.000Z");
 const candidates=Array.from({length:600},(_,n)=>({
  id:"geopolitics-"+n.toString(16).padStart(8,"0"),
  category:"geopolitics",status:"official_feed_candidate_unscored",
  published_at:new Date(at-n*60000).toISOString(),
 }));
 const signal={id:"rare_earth-abc12345",category:"rare_earth",
    title:"Geomacro finds critical-mineral inputs source-feed observation",
    published_at:new Date(at-36*3600000).toISOString(),date_precision:"exact",
    status:"osint_feed_observed_unverified",development_type:"unverified OSINT feed observation",
    topic:"critical-mineral inputs",geography:null,
    what_changed:"A monitored source feed reports: Mining Ministry announced new mineral refinery plans. This report has not been independently verified.",
    why_it_matters:"A mineral-related source-feed observation can guide checks of supply and production exposure. No actual supply impact is independently verified.",
    observed_release_count:1,same_event_corrob_verified:false,severity:null,sources_credited:["Monitored feed: mining.example"]};
 assert.equal(privateWebsiteRetentionPriority(signal),1);
 assert.equal(privateWebsiteRetentionPriority(candidates[0]),0);
 assert.equal(privateWebsiteRetentionNewestFirst(signal,candidates[0]),-1);
 let records=candidates,posted=0;
 const result=await publishPrivateOsintWebsiteSignals({
  signals:[signal],now:at,controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
  controlToken:"a".repeat(64),readAll:async()=>records,
  fetchImpl:async(_url,options)=>{
    posted++;
    records=[...records,...JSON.parse(options.body).signals]
      .sort(privateWebsiteRetentionNewestFirst).slice(0,600);
    return new Response(JSON.stringify({ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",
      accepted:JSON.parse(options.body).signals.length,persistent_derived_only:true,chargeable:false}),{status:200});
  },
 });
 assert.equal(posted,2);
 assert.equal(result.new_derived_stories,1);
 assert.equal(result.deferred_unpublished,0);
 assert.equal(records.length,600);
 assert.ok(records.some(x=>x.id===signal.id));
 assert.ok(!records.some(x=>x.id===candidates[candidates.length-1].id));
});

test("generic OSINT record cannot gain priority over a concrete event",()=>{
 const actor={status:"osint_feed_observed_unverified",topic:"critical-mineral inputs",
   what_changed:"A monitored source feed reports: The ministry announced a minerals plan."};
 assert.equal(privateWebsiteRetentionPriority({...actor,topic:"minerals publisher candidate"}),0);
 assert.equal(privateWebsiteRetentionPriority({...actor,what_changed:"Dated item about minerals"}),0);
 assert.equal(privateWebsiteRetentionPriority(actor),1);
 assert.equal(privateWebsiteRetentionPriority({status:"official_feed_candidate_unscored"}),0);
});

test('proven over-cap baseline repairs once and new writes sweep before complete readback',async()=>{
 const root='https://geomacro-control-plane.daspallab202391.workers.dev';
 const candidate={id:'macro-1234abcd',category:'macro',title:'Geomacro finds official monetary policy developments',
  what_changed:'An official publisher issued a dated monetary policy update. Effects require separate evidence.',
  why_it_matters:'This publication may inform financing conditions without proving any market outcome.',
  topic:'monetary policy',geography:null,development_type:'policy update',published_at:new Date(now).toISOString(),
  date_precision:'exact',observed_release_count:1,status:'official_release_observed_unscored',
  same_event_corrob_verified:false,severity:null,sources_credited:['Federal Reserve Board']};
 let records=Array.from({length:601},(_,i)=>({id:'geopolitics-'+i.toString(16).padStart(8,'0'),
  status:'official_release_observed_unscored',published_at:new Date(now-60000-i*1000).toISOString()}));
 const calls=[];
 const fetchImpl=async(url,options)=>{
  if(options.method==='GET'){
   calls.push('read');
   return records.length>600?Response.json({error:'DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED'},{status:503}):Response.json({signals:records});
  }
  const body=JSON.parse(options.body);calls.push(body.signals.length?'write':'sweep');
  records.push(...body.signals);
  if(!body.signals.length)records.sort(privateWebsiteRetentionNewestFirst).splice(600);
  return Response.json({ok:true,schema:'geomacro.website-derived-news-write-receipt.v1',
   accepted:body.signals.length,persistent_derived_only:true,chargeable:false});
 };
 const readAll=async fetcher=>{
  const response=await fetcher(root+'/v1/public/website-derived-news-bundle',{method:'GET'});
  if(!response.ok)throw Error('BASELINE_UNAVAILABLE');
  return (await response.json()).signals;
 };
 const receipt=await publishPrivateOsintWebsiteSignals({signals:[candidate],controlPlaneRoot:root,
  controlToken:'a'.repeat(64),fetchImpl,readAll,now});
 assert.deepEqual(calls,['read','sweep','read','write','sweep','read']);
 assert.equal(records.length,600);assert.equal(receipt.new_derived_stories,1);
 assert.equal(receipt.journal_readback_verified,true);
 // Unknown storage outages must never spend a speculative cleanup write.
 let writes=0;
 await assert.rejects(publishPrivateOsintWebsiteSignals({signals:[candidate],controlPlaneRoot:root,
  controlToken:'a'.repeat(64),now,readAll,fetchImpl:async(_url,init)=>{
   if(init.method!=='GET')writes++;
   return Response.json({error:'D1_UNAVAILABLE'},{status:503});
  }}),/BASELINE_UNAVAILABLE/);
 assert.equal(writes,0);
});
