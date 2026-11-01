import test from 'node:test';
import assert from 'node:assert/strict';
import {actorActionNewsObservation as render} from '../../src/lib/release-news-observation.ts';
import {publishDerivedStories} from '../../workers/control-plane/src/website-derived-intelligence.mjs';
import {spawnSync} from 'node:child_process';

test('explicit actor, action, target and amounts survive paraphrasing',()=>{
 for(const [title,expected] of [
  ['UK announces new sanctions on Russia',['United Kingdom','announced new sanctions on Russia']],
  ['UN calls for immediate ceasefire in Sudan',['United Nations','called for immediate ceasefire in Sudan']],
  ['Canada proposes new lithium export controls',['Canada','proposed new lithium export controls']],
  ['Federal Reserve cuts interest rates from 5.50% to 5.25%',['Federal Reserve','cut interest rates from 5.50% to 5.25%']],
 ]){
  const item=render(title);assert.ok(item);
  for(const part of expected){assert.ok(item.headline.includes(part));assert.ok(item.change.includes(part));}
  assert.notEqual(item.headline,title);assert.equal(item.change.includes('An official publisher'),false);
  assert.equal(item.headline.includes('\u2014'),false);
 }
});
test('the screenshot source patterns retain named actors, locations and explicit uncertainty',()=>{
 const unknown=render('Fate unknown of many returned to DPR Korea from China: UN independent experts');
 assert.ok(unknown.headline.includes('UN experts'));assert.ok(unknown.change.includes('remains unknown'));
 assert.ok(unknown.change.includes('China to North Korea'));
 const harvest=render('‘Ominous start’ to West Bank olive harvest amid settler attacks');
 assert.ok(harvest.headline.includes('West Bank olive harvest'));assert.ok(harvest.change.includes('settler attacks'));
 const aid=render('UN agencies appeal for help to protect weakest from unprecedented El Niño');
 assert.ok(aid.change.includes('UN agencies appealed'));assert.equal(aid.change.includes('aid delivered'),false);
});
test('conditional or injected content is never turned into a completed event',()=>{
 for(const title of ['India could cut interest rates','China may introduce export controls',
  'PRIVATE HEADLINE about diplomacy in Canada','UN announces <script>steal()</script>',
  'UN announces https://evil.test','Minister asks: "Who calls for ceasefire?"'])assert.equal(render(title),null);
 const denial=render('UK rejects new sanctions on Russia');assert.ok(denial.change.includes('rejected'));
 assert.equal(denial.change.includes('imposed'),false);
});
test('SQLite refresh changes only editorial content and preserves source and first-ingest clocks',async()=>{
 const captured=[],now=Date.parse('2026-10-22T12:00:00.000Z');
 const base={id:'macro-1234abcd',category:'macro',title:'Geomacro finds a monetary policy update',
  what_changed:'An official publisher released a monetary policy update about financial conditions.',
  why_it_matters:'Financing conditions can affect the cost of credit and currency exposure.',
  topic:'monetary policy',geography:'United States',development_type:'monetary policy',
  published_at:'2026-10-22T10:00:00.000Z',date_precision:'exact',observed_release_count:1,
  sources_credited:[],status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null};
 const env={DB:{prepare:sql=>({run:async()=>{captured.push({sql,args:[]});return {success:true};},bind:(...args)=>({
    sql,args,run:async()=>{captured.push({sql,args});return {success:true};},
    all:async()=>{
      if(!sql.startsWith('SELECT id,category,published_at,date_precision,story_json '))
        throw Error('UNEXPECTED_CANONICAL_READBACK_SQL');
      return {results:[{id:revised.id,category:revised.category,
        published_at:revised.published_at,date_precision:revised.date_precision,
        story_json:JSON.stringify(revised)}]};
    },
  })}),
  batch:async stmts=>{captured.push(...stmts);return stmts.map(()=>({success:true}));}}};
 const revised={...base,title:'Geomacro finds Federal Reserve cut interest rates from 5.50% to 5.25%',
  what_changed:'Federal Reserve cut interest rates from 5.50% to 5.25%.'};
 assert.equal((await publishDerivedStories(env,{schema:'geomacro.website-derived-news-batch.v1',signals:[revised]},now)).status,200);
 const python=`import sqlite3,json,sys
p=json.load(sys.stdin); d=sqlite3.connect(':memory:')
d.execute('CREATE TABLE website_derived_intelligence(id TEXT PRIMARY KEY,category TEXT,published_at TEXT,date_precision TEXT,story_json TEXT,first_seen_at TEXT)')
b=p['base'];first='2026-10-22T10:20:00.000Z'
d.execute('INSERT INTO website_derived_intelligence VALUES(?,?,?,?,?,?)',(b['id'],b['category'],b['published_at'],b['date_precision'],json.dumps(b),first))
for q in p['queries']: d.execute(q['sql'],q['args'])
r=d.execute('SELECT story_json,published_at,first_seen_at FROM website_derived_intelligence').fetchone()
assert json.loads(r[0])['title']==p['revised']['title']; assert r[1]==b['published_at']; assert r[2]==first
# The same ID cannot change the native source clock through editorial refresh.
q=p['queries'][0]; args=q['args'][:]; args[2]='2026-10-22T11:00:00.000Z'; d.execute(q['sql'],args)
assert d.execute('SELECT published_at,first_seen_at FROM website_derived_intelligence').fetchone()==(b['published_at'],first)
print('SQLITE_REVISION_CLOCKS_PRESERVED')`;
 const r=spawnSync('python',['-c',python],{input:JSON.stringify({base,revised,queries:captured}),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/SQLITE_REVISION_CLOCKS_PRESERVED/);
});

test('UN committee hearing names the reporting actor, forum and actual allegation',()=>{
 const title='‘War on Narco-Terrorism’ Fuels Unlawful Killings, Third Committee Hears, as Experts Warn of Mass Displacement, Attacks on Justice ';
 const result=render(title);assert.ok(result);
 assert.ok(result.headline.includes('Experts warn UN committee'));
 for(const fact of ['Experts told',"Third Committee",'unlawful killings','mass displacement','attacks on justice'])
  assert.ok(result.change.includes(fact));
 assert.equal(result.change.includes('An official publisher'),false);
 assert.equal(result.change.includes('independently confirmed'),false);
 assert.equal(render(title.replace('Experts Warn','Experts Might Warn')),null);
});
test('UN trailing-actor headings preserve the specific request and committee action',()=>{
 for(const [title,actor,action] of [
  ['On World Cities Day, Secretary-General Urges Adequate Housing for All','UN Secretary-General','housing'],
  ['Invest in Children, Invest in Future, Urges Secretary-General in Message for World Summit','UN Secretary-General','investment in children'],
  ['World Can No Longer Avoid Overshooting 1.5-Degree Limit, Warns Secretary-General on Launch of New Emissions Gap Report','UN Secretary-General','warned'],
  ['First Committee Debates Pathways to Prevent Weaponization of Outer Space','First Committee','debated'],
  ['Underscoring Need for Funding to Bolster Radiation Scientific Committee, Fourth Committee Approves Draft Lauding Its Valuable Inputs','Fourth Committee','approved a draft'],
 ]){
  const result=render(title);assert.ok(result,title);
  assert.ok(result.change.includes(actor));assert.ok(result.change.includes(action));
  assert.notEqual(result.headline,title);
 }
});

test('explicit Macro, FX and resource-release verbs remain event-specific and unscored',()=>{
 for(const [headline,past] of [
  ['Bank of Canada releases monthly inflation report','released monthly inflation report'],
  ['Federal Reserve maintains its policy rate','maintained its policy rate'],
  ['Bank of Japan holds benchmark interest rate steady','held benchmark interest rate steady'],
  ['European Central Bank forecasts economic growth for 2027','forecast economic growth for 2027'],
  ['Statistics Canada revises quarterly GDP estimates','revised quarterly GDP estimates'],
  ['U.S. Energy Information Administration publishes natural gas trade statistics','published natural gas trade statistics'],
  ['Australian Government estimates resources export earnings','estimated resources export earnings'],
  ['Mining Ministry records copper output in September','recorded copper output in September'],
 ]){
  const row=render(headline);
  assert.ok(row,headline);
  assert.ok(row.headline.includes(past),headline);
  assert.ok(row.change.includes(past),headline);
  assert.ok(!row.change.includes('An official publisher'),headline);
 }
 for(const title of [
  'Canada may revise quarterly GDP estimates',
  'GDP rises 3.1% on strong consumer spending',
  'Bank of Canada releases <script>bad</script>',
  'Federal Reserve may maintain interest rates',
  'Delamerian project reveals new mineral and groundwater insights beneath south-eastern Australia',
 ])assert.equal(render(title),null,title);
});
