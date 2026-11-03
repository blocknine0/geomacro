import test from "node:test";
import assert from "node:assert/strict";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {registeredReusableNewsSources,selectRegisteredNewsSources,
 collectRegisteredReusableNews,PRESIDENTIAL_ACTION_SOURCE_FEEDS,CURATED_US_MACRO_PAIR_FEEDS,
 SOURCE_FEED_HEADERS,SOURCE_FETCH_CONCURRENCY,SOURCE_FETCH_TIMEOUT_MS,
 PINNED_NATIONAL_PRIMARY_NEWS_FEEDS} from "./registered-reusable-news-source-collector.mjs";

const when=new Date("2026-10-25T00:00:00.000Z");
const feed="<rss version=\"2.0\"><channel>"+
 "<item><title><![CDATA[Federal Reserve announces new inflation and interest rate policy]]></title>"+
 "<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate>"+
 "<link>https://federalreserve.gov/leak-should-not-appear</link></item>"+
 "<item><title>Rare earth and lithium trade production rises 25 percent</title>"+
 "<pubDate>Sat, 24 Oct 2026 23:55:00 GMT</pubDate></item>"+
 "</channel></rss>";
function response(text){return new Response(text,{status:200,
 headers:{"Content-Type":"application/rss+xml"}})}
const normalize=x=>({
 schema:"geomacro.reusable-news-json.v1",id:"news-0000000000000000",category:x.category,
 source:{publisher_name:null,original_url:null,original_published_at:x.published_at},
 usage_rights:{commercial_reuse_authorized:false},
 delivery:{raw_article_included:false}
});
test("registry is bounded, HTTPS pinned, includes operator news and all three categories",()=>{
 const registry=registeredReusableNewsSources();
 assert.ok(registry.length>20);
 assert.equal(new Set(registry.map(x=>x.url)).size,registry.length);
 assert.ok(registry.some(x=>x.id==="news_aljazeera"));
 assert.ok(registry.some(x=>x.id==="news_dw"));
 for(const domain of ["geopolitics","macro","rare_earth"]){
   assert.ok(registry.some(x=>x.categories.includes(domain)));
 }
 assert.ok(registry.every(x=>x.url.startsWith("https://")));
 const selected=selectRegisteredNewsSources(when,registry,4);
 assert.ok(selected.length<=16);
 assert.ok(selected.every(x=>registry.some(s=>s.id===x.id)));
});
test("native RSS item dates produce fixed-schema noncommercial-safe factual JSON",async()=>{
 const registry=[
  {id:"source1",url:"https://example.org/feed.xml",categories:["macro","rare_earth"],supported:true,type:"rss"},
 ];
 let calls=0;
 const out=await collectRegisteredReusableNews({now:when,registry,perCategory:4,normalize,
   fetchImpl:async()=>{calls++;return response(feed);}});
 assert.equal(calls,1);
 assert.equal(out.items.length,3);
 assert.equal(out.checks.length,2);
 assert.ok(out.items.every(x=>x.schema==="geomacro.reusable-news-json.v1"));
 assert.ok(out.items.every(x=>x.delivery.raw_article_included===false));
 assert.ok(!JSON.stringify(out).includes("federalreserve.gov/leak"));
 assert.ok(!JSON.stringify(out).includes("Rare earth and lithium trade production rises"));
 assert.ok(out.items.every(x=>/^news-[0-9a-f]{64}$/u.test(x.id)));
 assert.equal(out.summary.source_rights_commercial_authorized,false);
});
test("denied sources return state without creating news or fabricated rights",async()=>{
 const registry=[{id:"source1",url:"https://example.org/feed.xml",categories:["geopolitics"],supported:true,type:"rss"}];
 const out=await collectRegisteredReusableNews({now:when,registry,normalize,
   fetchImpl:async()=>new Response("denied",{status:403})});
 assert.equal(out.items.length,0);assert.equal(out.checks[0].state,"DENIED");
 assert.equal(out.summary.paid_publication_authorized,false);
});
test("date-only, Atom updated-only and unsupported source formats cannot become current news",async()=>{
 const registry=[
  {id:"source1",url:"https://example.org/feed.xml",categories:["macro"],supported:true,type:"rss"},
  {id:"source2",url:"https://example.org/atom.xml",categories:["macro"],supported:true,type:"atom"},
  {id:"source3",url:"https://example.org/json",categories:["geopolitics"],supported:false,type:"json"}
 ];
 const mock=async url=>response(String(url).endsWith("atom.xml")?
   "<feed><entry><title>Inflation and rate changes in national monetary policy</title>"+
   "<updated>2026-10-24T23:30:00Z</updated></entry></feed>":
   "<rss><channel><item><title>Federal Reserve inflation and interest rate update</title>"+
   "<pubDate>2026-10-24</pubDate></item></channel></rss>");
 const out=await collectRegisteredReusableNews({now:when,registry,normalize,fetchImpl:mock});
 assert.equal(out.items.length,0);
 assert.ok(out.checks.some(c=>c.state==="UNSUPPORTED_FORMAT"));
 assert.ok(out.checks.some(c=>c.state==="EMPTY_OR_OUTSIDE_WINDOW"));
});

test("native GOV.UK official Search API JSON news with exact 25h source clock",async()=>{
 const now=new Date("2026-10-25T00:00:00.000Z");
 const spec={id:"govuk_global_economy",url:"https://www.gov.uk/api/search.json?q=economy",
  categories:["macro"],supported:true,type:"json"};
 const payload={results:[
  {title:"United Kingdom government announces monetary policy inflation changes",
   public_timestamp:"2026-10-24T23:50:00Z",link:"/government/news/example"},
  {title:"United Kingdom government publishes annual unemployment statistics",
   public_timestamp:"2026-10-22T22:00:00Z",link:"/government/news/expired"},
 ]};
 const collected=await collectRegisteredReusableNews({now,registry:[spec],normalize,
   resolveCountry:title=>title.includes("United Kingdom")?"GBR":null,
   fetchImpl:async()=>response(JSON.stringify(payload))});
 assert.equal(collected.items.length,1);
 assert.equal(collected.items[0].country_iso3,undefined);
 assert.equal(collected.summary.excluded_by_collector_capacity,0);
 assert.equal(collected.summary.source_rights_commercial_authorized,false);
 assert(!JSON.stringify(collected).includes("/government/news/example"));
});
test("source-native 25h clock rejects 25h+1 sec and admits 25h-1 sec",async()=>{
 const now=new Date("2026-10-25T00:00:00.000Z");
 const old=new Date(now.getTime()-25*3600000-1000).toUTCString();
 const fresh=new Date(now.getTime()-25*3600000+1000).toUTCString();
 const rss="<rss><channel>"+
  "<item><title>Central bank interest rate policy announces update</title><pubDate>"+old+"</pubDate></item>"+
  "<item><title>Central bank inflation policy announces change</title><pubDate>"+fresh+"</pubDate></item>"+
  "</channel></rss>";
 const doc=await collectRegisteredReusableNews({now,registry:[{
  id:"source1",url:"https://example.org/news/rss.xml",
  categories:["macro"],supported:true,type:"rss"}],
  normalize,fetchImpl:async()=>response(rss)});
 assert.equal(doc.items.length,1);
});


test("original US presidential publication lanes are pinned without evicting country/minerals rotation",()=>{
 const registered=registeredReusableNewsSources();
 for(const source of PRESIDENTIAL_ACTION_SOURCE_FEEDS)
   assert.ok(registered.some(x=>x.id===source.id&&x.url===source.url));
 for(const minute of [0,5,10,15,20,25,30]){
   const selected=selectRegisteredNewsSources(new Date(Date.parse("2026-10-27T12:00:00.000Z")+minute*60000));
   assert.ok(selected.some(s=>s.id==="white_house_presidential_actions"),"White House original actions: "+minute);
   assert.ok(selected.some(s=>s.id==="federal_register_executive_orders"),"Federal Register: "+minute);
   assert.equal(new Set(selected.map(s=>s.url)).size,selected.length);
   assert.ok(selected.length<=28);
 }
});
test("native-dated presidential actions are privately observed without requiring a war keyword",async()=>{
 const now=new Date("2026-10-27T13:00:00.000Z");
 const wh=PRESIDENTIAL_ACTION_SOURCE_FEEDS[0];
 const documentTitle="Improving Federal Services Through New Administrative Procedures";
 const xml="<rss><channel><item><title>"+documentTitle+"</title>"+
   "<pubDate>Tue, 27 Oct 2026 12:53:00 GMT</pubDate></item></channel></rss>";
 const out=await collectRegisteredReusableNews({now,registry:[{...wh,supported:true,type:"rss"}],
   normalize,fetchImpl:async()=>response(xml)});
 assert.equal(out.items.length,1);
 assert.equal(out.items[0].category,"geopolitics");
 assert.equal(out.items[0].usage_rights.commercial_reuse_authorized,false);
 assert.equal(out.items[0].delivery.raw_article_included,false);
 assert.equal(out.summary.source_rights_commercial_authorized,false);
 assert.ok(!JSON.stringify(out).includes(documentTitle),"original headline stays ephemeral");
});
test("compact CJK native headlines normalize as unverified factual JSON, not paid evidence",async()=>{
 const now=new Date("2026-10-27T13:00:00.000Z");
 const title="中国宣布关键矿产和稀土出口管制新政策";
 const xml="<rss><channel><item><title>"+title+"</title>"+
  "<pubDate>Tue, 27 Oct 2026 12:50:00 GMT</pubDate></item></channel></rss>";
 const out=await collectRegisteredReusableNews({now,registry:[{
  id:"original_chinese",url:"https://example.org/feed.xml",categories:["rare_earth"],
  supported:true,type:"rss"
 }],normalize:normalizeReusableNewsJson,fetchImpl:async()=>response(xml)});
 assert.equal(out.items.length,1);
 assert.equal(out.items[0].facts.fact_extraction_status,"INSUFFICIENT_MACHINE_EXTRACTABLE_FACTS");
 assert.equal(out.items[0].usage_rights.commercial_reuse_authorized,false);
 assert.equal(out.items[0].verification.facts_reviewed,false);
 assert.equal(out.items[0].delivery.raw_headline_included,false);
});
test("non-official neutral title is not fabricated into geopolitical news",async()=>{
 const out=await collectRegisteredReusableNews({now:when,registry:[{
   id:"third_party",url:"https://publisher.example/rss",categories:["geopolitics"],
   supported:true,type:"rss",officialDocument:false
 }],normalize,fetchImpl:async()=>response("<rss><channel><item>"+
   "<title>Improving Federal Services Through Administrative Procedures</title>"+
   "<pubDate>Sat, 24 Oct 2026 23:52:00 GMT</pubDate></item></channel></rss>")});
 assert.equal(out.items.length,0);
});
test("native-language macro, mineral and armed-conflict headlines are admitted as unverified candidates",async()=>{
 const cases=[
  ["macro","中国宣布新的利率政策和人民币汇率调整对金融市场的影响"],
  ["rare_earth","中国宣布关键矿产和稀土出口管制新政策"],
  ["geopolitics","联合国对停火谈判和边境战争局势发表声明"],
  ["macro","भारत सरकार ने मुद्रास्फीति पर नया आर्थिक विवरण जारी किया"],
  ["rare_earth","বাংলাদেশ সরকার লিথিয়াম খনিজ উত্তোলন সম্পর্কে নতুন ঘোষণা দিল"],
  ["geopolitics","الأمم المتحدة تعلن وقف إطلاق النار والاتفاق على الحدود"],
 ];
 for(const [category,title] of cases){
   const xml="<rss><channel><item><title>"+title+"</title>"+
     "<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate></item></channel></rss>";
   const out=await collectRegisteredReusableNews({now:when,registry:[{
     id:"native_issuer",url:"https://example.org/feed",categories:[category],
     supported:true,type:"rss"
   }],normalize,fetchImpl:async()=>response(xml)});
   assert.equal(out.items.length,1,category+" | "+title);
   assert.equal(out.items[0].category,category);
   assert.equal(out.items[0].usage_rights.commercial_reuse_authorized,false);
 }
});

test("WTO/BIS/Australia original verticals produce separate native-clock non-payable structured discovery",async()=>{
 const sources=registeredReusableNewsSources();
 const cases=[
  ["wto_trade_policy_global","geopolitics","WTO trade dispute tariffs and safeguard measures between economies"],
  ["bis_management_macro_global","macro","BIS management speech on financial stability liquidity and inflation policy"],
  ["australia_critical_minerals_minister_global","rare_earth","Australia approves new critical minerals lithium processing project"],
 ];
 const requested=new Map();
 for(const [id,category,title] of cases){
  const s=sources.find(x=>x.id===id);
  assert.ok(s&&s.supported&&s.categories.includes(category),id);
  requested.set(s.url,{spec:s,category,title});
 }
 assert.equal(requested.size,3);
 const collected=await collectRegisteredReusableNews({
  now:new Date("2026-10-29T12:00:00Z"),
  registry:[...requested.values()].map(x=>x.spec),
  normalize,resolveCountry:()=>null,perCategory:8,
  fetchImpl:async url=>{
   const entry=requested.get(url);
   assert.ok(entry,"no arbitrary network URL");
   const xml="<rss><channel><item><title>"+entry.title+"</title>"+
    "<pubDate>Thu, 29 Oct 2026 11:55:00 GMT</pubDate></item></channel></rss>";
   return response(xml);
  },
 });
 assert.equal(collected.items.length,3);
 assert.equal(collected.checks.length,3);
 assert.deepEqual(new Set(collected.items.map(x=>x.category)),
  new Set(["geopolitics","macro","rare_earth"]));
 for(const category of ["geopolitics","macro","rare_earth"]){
  assert.equal(collected.summary.supported_registered_sources_by_category[category],1);
  assert.equal(collected.summary.actual_observed_country_count_by_category[category],0);
 }
 assert.equal(collected.summary.source_rights_commercial_authorized,false);
 assert.equal(collected.summary.paid_publication_authorized,false);
 assert.equal(collected.summary.original_issuer_page_verified,false);
 assert.equal(collected.summary.raw_upstream_stored,false);
 assert.ok(collected.items.every(x=>x.usage_rights.commercial_reuse_authorized===false
  &&x.delivery.raw_article_included===false
  &&x.source.original_published_at==="2026-10-29T11:55:00.000Z"));
 for(const entry of requested.values())assert.ok(!JSON.stringify(collected).includes(entry.title));
});


test("two real pinned US macro original feeders join the existing rotating D1 collector without granting commercial rights",async()=>{
 const registry=registeredReusableNewsSources();
 assert.equal(CURATED_US_MACRO_PAIR_FEEDS.length,2);
 for(const x of CURATED_US_MACRO_PAIR_FEEDS){
   assert.ok(registry.some(s=>s.id===x.id&&s.url===x.url&&
      s.categories.includes("macro")&&s.priority===true));
 }
 for(const minute of [0,15,30,45]){
   const selected=selectRegisteredNewsSources(new Date(Date.parse("2026-10-27T12:00:00Z")+minute*60000));
   assert.equal(selected.filter(s=>CURATED_US_MACRO_PAIR_FEEDS.some(c=>c.url===s.url)).length,2);
 }
 const now=new Date("2026-10-30T09:00:00Z");
 const byUrl=new Map([
  [CURATED_US_MACRO_PAIR_FEEDS[0].url,
   "Employment Cost Index update published by US BLS official agency"],
  [CURATED_US_MACRO_PAIR_FEEDS[1].url,
   "Federal Reserve monetary policy and inflation update announcement"],
 ]);
 const results=await collectRegisteredReusableNews({
  now,registry:registry.filter(s=>byUrl.has(s.url)),normalize,
  resolveCountry:()=>null,perCategory:8,
  fetchImpl:async url=>response("<rss><channel><item><title>"+
    byUrl.get(url)+"</title><pubDate>Fri, 30 Oct 2026 08:00:00 GMT</pubDate>"+
    "</item></channel></rss>"),
 });
 assert.equal(results.items.length,2);
 assert.ok(results.items.every(i=>i.usage_rights.commercial_reuse_authorized===false));
 assert.equal(results.summary.source_rights_commercial_authorized,false);
 assert.equal(results.summary.paid_publication_authorized,false);
});

test("RDF Dublin Core item-native clock and bare XML ampersand are safe private discovery",async()=>{
 const now=new Date("2026-10-25T00:00:00.000Z");
 const xml='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '+
  'xmlns:dc="http://purl.org/dc/elements/1.1/">'+
  '<item><title>Central bank inflation & interest rate decisions</title>'+
  '<link>https://example.org/facts?kind=macro&year=2026</link>'+
  '<dc:date>2026-10-24T23:52:00Z</dc:date></item></rdf:RDF>';
 const out=await collectRegisteredReusableNews({now,
  registry:[{id:"example_rdf",url:"https://example.org/news.rdf",categories:["macro"],
    supported:true,type:"rdf"}],
  normalize,allowRdfNativeDates:true,fetchImpl:async()=>response(xml)});
 assert.equal(out.items.length,1);
 assert.equal(out.checks[0].state,"OBSERVED");
 assert.equal(out.items[0].usage_rights.commercial_reuse_authorized,false);
 assert.equal(out.summary.alternative_source_attempts,0);
 assert.equal(out.summary.degraded_quarantine.length,0);
 assert.ok(!JSON.stringify(out).includes("Central bank inflation &"));
});
test("failed pinned publisher is quarantined and category-matched first-party alternative is fetched",async()=>{
 const now=new Date("2026-10-25T00:00:00.000Z");
 const registry=[
 {id:"blocked_publisher",url:"https://blocked.example/rss",categories:["geopolitics"],
  supported:true,type:"rss"},
 {id:"un_press_global",url:"https://press.un.org/en/rss.xml",categories:["geopolitics"],
  supported:true,type:"rss"},
 ];
 const current=Array.from({length:10},(_,i)=>new Date(now.getTime()+i*300000))
  .find(clock=>selectRegisteredNewsSources(clock,registry,1)[0]?.id==="blocked_publisher");
 assert.ok(current);
 let fallbackRequests=0;
 const out=await collectRegisteredReusableNews({now:current,perCategory:1,registry,normalize,
  fetchImpl:async url=>{
   if(String(url).includes("blocked.example"))return new Response("deny",{status:403});
   fallbackRequests++;
   return response('<rss><channel><item>'+
     '<title>Security Council announces ceasefire after border conflict</title>'+
     '<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate>'+
     '</item></channel></rss>');
  }});
 assert.equal(fallbackRequests,1);
 assert.equal(out.items.length,1);
 assert.ok(out.checks.some(c=>c.state==="DENIED"));
 assert.equal(out.summary.degraded_quarantine[0].recovery_state,"DEGRADED_QUARANTINE");
 assert.equal(out.summary.alternative_source_attempts,1);
 assert.equal(out.summary.paid_publication_authorized,false);
});


test("registered native JSON items keep original publication clock and no publisher text",async()=>{
 const registry=[{id:"official_json_feed",url:"https://example.org/official.json",
   categories:["macro"],type:"json",supported:true}];
 const body={items:[
  {title:"Central bank announces inflation policy and interest rate reduction",
   publishedAt:"2026-10-24T23:50:00Z",url:"https://example.org/article/1"},
  {title:"Central bank updates economic bulletin without original publication time",
   updated:"2026-10-24T23:50:00Z",url:"https://example.org/article/2"}
 ]};
 const out=await collectRegisteredReusableNews({now:when,registry,normalize,
   fetchImpl:async()=>response(JSON.stringify(body))});
 assert.equal(out.items.length,1);
 assert.equal(out.checks[0].state,"OBSERVED");
 assert.equal(out.summary.raw_upstream_stored,false);
 assert.equal(out.summary.paid_publication_authorized,false);
 assert(!JSON.stringify(out).includes("example.org/article/1"));
});
test("feed transport uses bounded 15-second timeout, ten-way ceiling and transparent headers",async()=>{
 assert.equal(SOURCE_FETCH_TIMEOUT_MS,15000);
 assert.equal(SOURCE_FETCH_CONCURRENCY,10);
 assert.match(SOURCE_FEED_HEADERS["User-Agent"],/GeoMacro Research Bot/u);
 assert.match(SOURCE_FEED_HEADERS.Accept,/application\/json/u);
 let count=0;
 const out=await collectRegisteredReusableNews({
  now:when,normalize,
  registry:[{id:"only_feed",url:"https://example.org/rss",
    categories:["macro"],supported:true,type:"rss"}],
  fetchImpl:async(url,opts)=>{
   count++;assert.equal(opts.headers["User-Agent"],SOURCE_FEED_HEADERS["User-Agent"]);
   assert.equal(opts.headers["Accept-Language"],"en-US,en;q=0.8");
   assert.equal(opts.signal.aborted,false);
   return response(feed);
  },
 });
 assert.equal(count,1);
 assert.ok(out.items.length>=1);
 await assert.rejects(()=>collectRegisteredReusableNews({now:when,
  normalize,networkConcurrency:11,registry:[],fetchImpl:async()=>response(feed)}),
  /REUSABLE_NEWS_COLLECTOR_INPUT_INVALID/u);
});

test("multiple RSS sources with the same original permalink spend only one D1 candidate",async()=>{
 const shared="https://example.org/news/rate-change?utm_source=first";
 const same="https://example.org/news/rate-change?utm_source=second";
 const xml=url=>'<rss><channel><item><title>Central bank announces monetary interest rate policy change</title>'+
  '<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate><link>'+url+
  '</link></item></channel></rss>';
 const registry=[
  {id:"source_one",url:"https://alpha.example.org/rss",
    categories:["macro"],supported:true,type:"rss"},
  {id:"source_two",url:"https://beta.example.org/rss",
    categories:["macro"],supported:true,type:"rss"},
 ];
 const r=await collectRegisteredReusableNews({now:when,registry,normalize,
  fetchImpl:async url=>response(xml(url.includes("alpha")?shared:same))});
 assert.equal(r.checks.length,2);
 assert.equal(r.items.length,1);
 assert.equal(r.summary.duplicate_original_permalinks_filtered_in_memory,1);
 assert.equal(r.summary.raw_upstream_stored,false);
});

test("eight existing first-party national issuer URLs carry ISO3 routing hints only",()=>{
 const registry=registeredReusableNewsSources();
 assert.equal(PINNED_NATIONAL_PRIMARY_NEWS_FEEDS.length,8);
 const expected=new Map([
  ["rbi.org.in","IND"],["www.rba.gov.au","AUS"],
  ["www.centralbank.go.ke","KEN"],["www.cochilco.cl","CHL"],
 ]);
 for(const [domain,iso3] of expected){
  const source=registry.find(x=>new URL(x.url).hostname===domain);
  assert.ok(source,"missing national first-party source "+domain);
  assert.equal(source.publisher_country_iso3,iso3);
  assert.equal(source.scope,"national_primary");
  assert.equal(source.domestic_event_context,"PUBLISHER_DOMESTIC_SCOPE_UNVERIFIED_EVENT");
 }
});
test("national primary macro issuer hint is not independent country/event proof",async()=>{
 const source=registeredReusableNewsSources().find(x=>x.id==="india_rbi_policy");
 assert.ok(source);
 const rss="<rss><channel><item><title>Reserve Bank announces new monetary policy and interest rate framework</title>"+
  "<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate></item></channel></rss>";
 const out=await collectRegisteredReusableNews({now:when,registry:[source],
  normalize:x=>({...normalize(x),country_iso3:x.country_iso3??null}),
  resolveCountry:()=>null,fetchImpl:async()=>response(rss)});
 assert.equal(out.items.length,1);
 assert.equal(out.items[0].country_iso3,"IND");
 assert.equal(out.summary.issuer_context_country_fallbacks_not_independently_verified,1);
 assert.equal(out.summary.paid_publication_authorized,false);
});
test("explicit foreign headline always wins over issuer jurisdiction context",async()=>{
 const source=registeredReusableNewsSources().find(x=>x.id==="india_rbi_policy");
 const rss="<rss><channel><item><title>Federal Reserve announces US monetary interest rate change</title>"+
  "<pubDate>Sat, 24 Oct 2026 23:50:00 GMT</pubDate></item></channel></rss>";
 const out=await collectRegisteredReusableNews({now:when,registry:[source],
  normalize:x=>({...normalize(x),country_iso3:x.country_iso3??null}),
  resolveCountry:()=> "USA",fetchImpl:async()=>response(rss)});
 assert.equal(out.items.length,1);
 assert.equal(out.items[0].country_iso3,"USA");
 assert.equal(out.summary.issuer_context_country_fallbacks_not_independently_verified,0);
});
