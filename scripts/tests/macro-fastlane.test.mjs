import test from 'node:test';
import assert from 'node:assert/strict';
import {MACRO_NEWS_SOURCES,planMacroSources,normalizeMetalQuote,measuredPriceReaction,macroPreciousTopic,macroEventContext} from '../lib/macro-fx-metals.mjs';
import {parseMacroCalendar,zonedRelease,releaseWindowEvents} from '../lib/macro-release-calendar.mjs';
import {collectMacroFastlane,parseMacroFeed} from '../lib/macro-fastlane-collector.mjs';
import {MINERALS_MESH,collectCriticalMineralsFastlane,parseSectorFeed} from '../lib/critical-minerals-fastlane.mjs';
import {deriveStatelessSignals} from '../../src/lib/stateless-intelligence-model.ts';
import {verifyDerivedStory} from '../../workers/control-plane/src/website-derived-intelligence.mjs';
import {validateMacroState,storeMacroState,loadMacroState,runMacroReleaseTick,publicMacroProjection,macroPriceEvidence} from '../../workers/control-plane/src/macro-fastlane.mjs';
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
const now=Date.parse('2026-10-27T12:00:00Z');
const at=new Date(now-60000).toISOString();
const rss=(title,url,clock=at)=>`<rss><channel><item><title>${title}</title><link>${url}</link><pubDate>${clock}</pubDate></item></channel></rss>`;
const atom=(title,url,clock=at)=>`<feed><entry><title>${title}</title><link href="${url}"/><published>${clock}</published></entry></feed>`;
const freshState=()=>({schema:'geomacro.macro-fastlane-state.v1',checked_at:new Date(now).toISOString(),quota_lease_until:new Date(now+12*60000).toISOString(),cursors:{},events:[],quotes:[],source_checks:[],price_checks:[],calendar_checks:[],calendar_checked_at:now});
class DB{
 constructor(state={}){this.state=state;this.news=new Map();this.operations=[];}
 prepare(sql){const db=this;return {async first(){
  if(sql==='SELECT COUNT(*) AS journal_rows FROM website_derived_intelligence'){
   db.operations.push('read_journal_count');
   return {journal_rows:db.news.size};
  }
  throw Error('UNEXPECTED_D1_FIRST_SQL');
 },async run(){db.operations.push('retention');return {success:true};},bind(...args){return {async first(){db.operations.push('read_state');return Object.keys(db.state).length?{value_json:JSON.stringify(db.state)}:null;},async run(){if(sql.startsWith('INSERT INTO control_state')){db.state=JSON.parse(args[1]);db.operations.push('write_state');}else if(sql.startsWith('INSERT INTO website_derived_intelligence')){db.news.set(args[0],JSON.parse(args[4]));db.operations.push('write_news');}return {success:true};},sql,args};}};}
 async batch(statements){for(const s of statements){this.news.set(s.args[0],JSON.parse(s.args[4]));this.operations.push('write_news');}return statements.map(()=>({success:true}));}
}
test('Macro lanes cover all pinned issuers and never double-fetch shared Fed/ECB',()=>{
 assert.ok(MACRO_NEWS_SOURCES.every(s=>s.category==='macro'));
 const seen=new Set();for(let n=0;n<3;n++)for(const s of planMacroSources(now+n*300000,{reusedIds:['fed_press','ecb_press']})){assert.ok(!['fed_press','ecb_press'].includes(s.id));seen.add(s.id);}
 for(const s of MACRO_NEWS_SOURCES.filter(s=>!s.shared))assert.ok(seen.has(s.id),s.id);
 assert.equal(new Set(MACRO_NEWS_SOURCES.map(s=>s.url)).size,MACRO_NEWS_SOURCES.length);
});
test('Gold/silver are Macro Economics; related markets share the one journal event ID',()=>{
 for(const title of ['World Gold Council reports central bank gold buying','Silver industrial demand increases as solar manufacturing expands']){
  const rows=deriveStatelessSignals([{title,articleUrl:'https://www.gold.org/goldhub/research/test',sourceId:'wgc_research',category:'macro',credit:'World Gold Council',publishedAt:at}],now);
  assert.equal(rows.length,1);assert.equal(rows[0].category,'macro');assert.ok(verifyDerivedStory(rows[0],now));
  const c=macroEventContext(rows[0]);assert.equal(c.event_id,rows[0].id);assert.equal(c.parent_category,'macro');assert.deepEqual(c.lanes,['precious_metals']);assert.equal(c.surprise_vs_consensus,null);
 }
 assert.equal(macroPreciousTopic('Golden medal awarded to researcher'),null);
 const s=MACRO_NEWS_SOURCES.find(s=>s.id==='bls_cpi');
 assert.equal(parseMacroFeed(atom('Consumer Price Index release','https://www.bls.gov/news.release/cpi.nr0.htm'),s,now).length,1);
 assert.equal(parseMacroFeed(atom('Consumer Price Index release','https://attacker.example/news.release/cpi.nr0.htm'),s,now).length,0);
 assert.equal(parseMacroFeed(atom('Consumer Price Index release','https://www.bls.gov/news.release/cpi.nr0.htm').replace('<published>','<updated>').replace('</published>','</updated>'),s,now).length,0);
});
test('Quote age, unit, ordering and event bracketing gate numerical reaction; no causal claim',()=>{
 const q={symbol:'XAU',currency:'USD',price:4000,updatedAt:at};
 const before=normalizeMetalQuote(q,'XAU',now);assert.ok(before);
 for(const bad of [{...q,price:-1},{...q,currency:'INR'},{...q,symbol:'XAG'},{...q,updatedAt:'2026-10-27T11:00:00Z'},{...q,updatedAt:'2026-10-27T12:01:00Z'},{...q,updatedAt:'2026-10-27T11:59:00'}])assert.equal(normalizeMetalQuote(bad,'XAU',now),null);
 const after={...before,value:4040,observed_at:new Date(now+60000).toISOString()};
 const reaction=measuredPriceReaction(new Date(now).toISOString(),before,after);assert.ok(Math.abs(reaction.change_pct-1)<1e-10);assert.equal(reaction.caused_by_event_verified,false);
 assert.equal(measuredPriceReaction(at,after,before),null);assert.equal(measuredPriceReaction(at,before,{...after,unit:'gram'}),null);
});
test('Release calendars honor original release times and DST, not collection clocks',()=>{
 assert.equal(zonedRelease(2026,10,28,14,0,'America/New_York'),'2026-10-28T18:00:00.000Z');
 assert.equal(zonedRelease(2026,12,9,14,0,'America/New_York'),'2026-12-09T19:00:00.000Z');
 assert.equal(zonedRelease(2026,10,29,14,15,'Europe/Berlin'),'2026-10-29T13:15:00.000Z');
 const ics='BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=US-Eastern:20261028T083000\nSUMMARY:Consumer Price Index\nEND:VEVENT\nEND:VCALENDAR';
 assert.equal(parseMacroCalendar('bls',ics,now)[0].at,'2026-10-28T12:30:00.000Z');
 const ecb='<dt>29/10/2026</dt><dd>Governing Council monetary policy meeting (Day 2)</dd><dt>25/11/2026</dt><dd>non-monetary policy meeting</dd>';
 assert.equal(parseMacroCalendar('ecb',ecb,now).length,1);
 const events=[{kind:'cpi',source:'bls',at:new Date(now).toISOString()}];assert.equal(releaseWindowEvents(events,now+20*60000).length,1);assert.equal(releaseWindowEvents(events,now+21*60000).length,0);
});
test('Malformed/denied sources cannot block healthy issuers; BLS requests stay serialized',async()=>{
 let active=0,max=0;
 const result=await collectMacroFastlane({now,state:freshState(),sourceIds:['bls_cpi','bls_employment','bls_ppi'],prices:false,calendars:false,fetchImpl:async url=>{
  active++;max=Math.max(max,active);await Promise.resolve();active--;
  if(url.includes('empsit'))return new Response('',{status:403});
  const family=url.includes('ppi')?'ppi':'cpi';return new Response(atom(family==='cpi'?'Consumer Price Index release':'Producer Price Index release',`https://www.bls.gov/news.release/${family}.nr0.htm`));
 }});
 assert.equal(max,1);assert.equal(result.candidates.length,2);assert.equal(result.state.cursors.bls_employment.retry_after,now+15*60000);assert.ok(validateMacroState(result.state,now));
});
test('The same bundle reuses one global fallback request across regional failures',async()=>{
 const urls=[];
 const result=await collectCriticalMineralsFastlane({now,macroNeedsFallback:true,fetchImpl:async url=>{
  urls.push(url);
  if(url==='https://www.mining.com/feed/')return new Response(rss('Chile announces new copper and lithium export rules','https://www.mining.com/chile-copper-lithium-export-rules/'));
  if(new URL(url).hostname==='news.google.com')return new Response(rss('China announces rare earth export controls','https://news.google.com/rss/articles/example'));
  return new Response('',{status:403});
 }});
 assert.equal(MINERALS_MESH.length,6);assert.equal(urls.filter(u=>u==='https://www.mining.com/feed/').length,1);assert.ok(urls.length<=13);assert.ok(result.signals.length>0);
 assert.ok(result.signals.every(s=>s.status==='osint_feed_observed_unverified'&&verifyDerivedStory(s,now)));
 assert.equal(result.receipt.google_is_original_verification,false);
 const spec={url:'https://www.mining.com/feed/'};
 const precious=parseSectorFeed(rss('Gold mine production increases as central bank buying grows','https://www.mining.com/gold-mine-output/'),spec,now);assert.ok(precious.length>0);assert.ok(precious.every(s=>s.category==='macro'));
 assert.equal(parseSectorFeed(rss('Chile announces new copper and lithium export rules','https://evil.test/story'),spec,now).length,0);
 const projection=buildDerivedNewsStructural(result.signals,now,'attributed_research');assert.equal(projection.length,result.signals.length);assert.ok(projection.every(x=>x.confidence_state==='MONITORED_SOURCE_REPORT_UNVERIFIED'&&!x.qualifying_topic_release_verified));
});
test('State projection persists no arbitrary raw fields and release tick cannot self-renew quota admission',async()=>{
 const state=freshState();state.raw_article='SECRET';const db=new DB();
 assert.equal((await storeMacroState({DB:db},state,now)).status,200);assert.ok(!JSON.stringify(db.state).includes('SECRET'));
 let requests=0;const fetchImpl=async()=>{requests++;throw Error('should not poll');};
 assert.equal((await runMacroReleaseTick({DB:db},{now:now+13*60000,fetchImpl})).state,'QUOTA_LEASE_HELD');assert.equal(requests,0);
 assert.equal((await runMacroReleaseTick({DB:db},{now:now+60000,fetchImpl})).state,'OUTSIDE_RELEASE_WINDOW');assert.equal(requests,0);
 assert.equal(publicMacroProjection(state,now+16*60000).status,'POLL_FRESHNESS_UNVERIFIED');
});
test('Release minute publishes into the same journal with fixed quota lease and separated prices',async()=>{
 const state=freshState();state.checked_at=new Date(now-120000).toISOString();state.events=[{kind:'cpi',source:'bls',at:new Date(now).toISOString()}];
 const db=new DB(state),lease=state.quota_lease_until;
 const result=await runMacroReleaseTick({DB:db},{now,fetchImpl:async url=>new URL(url).hostname==='www.bls.gov'?new Response(atom('Consumer Price Index release','https://www.bls.gov/news.release/cpi.nr0.htm')):new Response(JSON.stringify({symbol:url.endsWith('XAU')?'XAU':'XAG',price:100,currency:'USD',updatedAt:at}))});
 assert.equal(result.state,'RELEASE_POLLED');assert.equal(db.news.size,1);assert.equal(db.state.quota_lease_until,lease);assert.equal(db.state.quotes.length,2);
 const signal=[...db.news.values()][0];assert.equal(signal.category,'macro');assert.equal(macroPriceEvidence(signal,db.state).price_reaction,null);
 assert.equal((await runMacroReleaseTick({DB:db},{now,fetchImpl:async()=>{throw Error('duplicate');}})).state,'ALREADY_POLLED');
});
test('BLS mutable/archived aliases deduplicate one event while a later monthly release gets a new ID',()=>{
 const one={title:'Consumer Price Index release',articleUrl:'https://www.bls.gov/news.release/cpi.nr0.htm',sourceId:'bls_cpi',category:'macro',credit:null,publishedAt:at};
 const alias={...one,articleUrl:'https://www.bls.gov/news.release/archives/cpi_10272026.htm'};
 const later={...one,publishedAt:new Date(now).toISOString()};
 const rows=deriveStatelessSignals([one,alias,later],now);assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
});
test('Direct release acceptance requires actual original-page timestamp matching the calendar',async()=>{
 const {directReleaseSpec,verifiedDirectRelease}=await import('../lib/macro-direct-release.mjs');
 const event={kind:'fomc',at:'2026-10-28T18:00:00.000Z'};
 const spec=directReleaseSpec(event);assert.equal(spec.url,'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm');
 const html='<p>October 28, 2026</p><h1>Federal Reserve issues FOMC statement</h1><p>For release at 2:00 p.m. EDT</p>';
 assert.ok(verifiedDirectRelease(html,spec,event,Date.parse(event.at)+60000));
 assert.equal(verifiedDirectRelease(html.replace('October 28','September 16'),spec,event,Date.parse(event.at)+60000),null);
 const fed='<h4><a id="42828">2026 FOMC Meetings</a></h4><div class="fomc-meeting__month"><strong>October</strong></div><div class="fomc-meeting__date">27-28</div>';
 assert.equal(parseMacroCalendar('fed',fed,now)[0].at,event.at);
});
test('Minute-worker fixed release projection shares full newsroom event IDs and avoids false rate claims',async()=>{
 const {deriveCriticalReleaseSignals}=await import('../lib/macro-direct-release.mjs');
 for(const [id,title,url,kind]of [['fed_press','Federal Reserve issues FOMC statement','https://www.federalreserve.gov/newsevents/pressreleases/monetary20261027a.htm','fomc'],['bls_cpi','Consumer Price Index release','https://www.bls.gov/news.release/cpi.nr0.htm','cpi']]){
  const candidate={sourceId:id,title,articleUrl:url,category:'macro',credit:null,publishedAt:at};
  const full=deriveStatelessSignals([candidate],now)[0];
  const fast=deriveCriticalReleaseSignals([candidate],[{kind,at}],now)[0];
  assert.equal(fast.id,full.id);assert.ok(verifyDerivedStory(fast,now));assert.equal(fast.severity,null);assert.equal(fast.same_event_corrob_verified,false);
 }
});
test('Concurrent cron snapshots cannot erase a later quota lease or overwrite a newer price snapshot',async()=>{
 const {readFileSync}=await import('node:fs');const {execFileSync}=await import('node:child_process');
 const source=readFileSync('workers/control-plane/src/macro-fastlane.mjs','utf8');
 const sql=/env\.DB\.prepare\(`(INSERT INTO control_state[\s\S]*?)` \)/.exec(source)?.[1];assert.ok(sql);
 const code=`import json,sqlite3,sys\np=json.load(sys.stdin)\nd=sqlite3.connect(':memory:')\nd.execute('CREATE TABLE control_state(key TEXT PRIMARY KEY,value_json TEXT,version INTEGER,updated_at TEXT)')\nfor s in p['states']: d.execute(p['sql'],('macro_fx_metals_fastlane_v1',json.dumps(s),s['checked_at']))\nprint(d.execute('SELECT value_json FROM control_state').fetchone()[0])`;
 const older={checked_at:'2026-10-27T12:00:00.000Z',quota_lease_until:'2026-10-27T12:20:00.000Z',quotes:[{value:100}]};
 const newer={checked_at:'2026-10-27T12:01:00.000Z',quota_lease_until:'2026-10-27T12:12:00.000Z',quotes:[{value:101}]};
 for(const states of [[older,newer],[newer,older]]){
  const result=JSON.parse(execFileSync('python3',['-c',code],{encoding:'utf8',input:JSON.stringify({sql,states})}));
  assert.equal(result.checked_at,newer.checked_at);assert.equal(result.quota_lease_until,older.quota_lease_until);assert.equal(result.quotes[0].value,101);
 }
});
test('Publisher text is decoded once and hidden script clocks cannot fabricate a current release',async()=>{
 const spec=MACRO_NEWS_SOURCES.find(s=>s.id==='bls_cpi');
 const rows=parseMacroFeed(atom('Consumer Price Index &amp;quot;release&amp;quot;','https://www.bls.gov/news.release/cpi.nr0.htm'),spec,now);
 assert.equal(rows[0].title,'Consumer Price Index &quot;release&quot;');
 const {verifiedDirectRelease,directReleaseSpec}=await import('../lib/macro-direct-release.mjs');
 const event={kind:'fomc',at:'2026-10-28T18:00:00.000Z'};
 const hidden='<h3>Federal Reserve issues FOMC statement</h3><script>October 28, 2026 For release at 2:00 p.m. EDT</script x><p>September 16, 2026 For release at 2:00 p.m. EDT</p>';
 assert.equal(verifiedDirectRelease(hidden,directReleaseSpec(event),event,Date.parse(event.at)+60000),null);
});
test('Quote validation uses receipt time after polling, without admitting actually future quotes',async()=>{
 const received=now+30000;
 const result=await collectMacroFastlane({now,quoteClock:()=>received,state:freshState(),sourceIds:[],calendars:false,fetchImpl:async url=>new Response(JSON.stringify({symbol:url.endsWith('XAU')?'XAU':'XAG',price:100,currency:'USD',updatedAt:new Date(now+20000).toISOString()}))});
 assert.equal(result.state.quotes.length,2);
 assert.ok(result.state.quotes.every(q=>Date.parse(q.received_at)===received));
 assert.equal(normalizeMetalQuote({symbol:'XAU',currency:'USD',price:100,updatedAt:new Date(received+1000).toISOString()},'XAU',received),null);
});
test('Maximum packing respects both the 50-row cap and the existing UTF-8 HTTP ingress limit',async()=>{
 const {packDerivedNewsBatches}=await import('../lib/macro-fx-metals.mjs');
 const rows=Array.from({length:120},(_,id)=>({id,text:'অ'.repeat(700)}));
 const batches=packDerivedNewsBatches(rows);
 assert.deepEqual(batches.flat(),rows);
 assert.ok(batches.every(b=>b.length<=50&&new TextEncoder().encode(JSON.stringify({schema:'geomacro.website-derived-news-batch.v1',signals:b})).byteLength<=60*1024));
 assert.ok(batches.length>Math.ceil(rows.length/50));
 assert.equal(packDerivedNewsBatches([]).length,0);
});
