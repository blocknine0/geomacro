import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {newsToProductPacket,buildNewsProductPacket} from '../../src/lib/news-product-factory.ts';
import {normalizeReusableNewsJson} from '../../src/lib/reusable-news-json.ts';
import {readNewsProductFactory} from '../../workers/control-plane/src/news-product-factory.mjs';
const now=Date.parse('2026-10-27T12:00:00.000Z');
const input={category:'macro',country_iso3:'USA',published_at:'2026-10-27T11:55:00.000Z',
  text:'The Federal Reserve announced a policy rate reduction of 25 basis points.',license:'unknown'};
const news=()=>({...normalizeReusableNewsJson(input),id:'news-'+createHash('sha256').update('native-news').digest('hex')});
test('one news produces twelve priced drafts without inventing proof, prices or numeric relationships',async()=>{
  const packet=await newsToProductPacket(input,{now});
  assert.equal(packet.variant_count,12);assert.equal(packet.unique_input_count,1);
  assert.equal(new Set(packet.products.map(p=>p.capability+'/'+p.variant)).size,12);
  assert.deepEqual(packet.products.map(p=>p.price_usdc),['0.02','0.05','0.03','0.08','0.05','0.10','0.15','0.05','0.10','0.10','0.15','0.25']);
  assert.equal(packet.facts.numeric_mentions[0].relationship,'UNBOUND_SOURCE_MENTION');
  assert.equal(packet.facts.verified_delta,null);assert.equal(packet.execution_authorized,false);
  assert.equal(packet.products.every(p=>p.ready_for_paid_delivery===false),true);
  assert.equal(packet.products.find(p=>p.id==='corridor_profile').canonical_request,null);
  assert.equal(packet.products.find(p=>p.id==='signed_new').canonical_request.product.issued_after,undefined);
  assert.equal(JSON.stringify(packet).includes(input.text),false);
  assert.equal(packet.analysis.transmission_is_scenario_not_observed_impact,true);
});
test('identical input and scope replay exactly; fact revisions and directional scope change the hash',async()=>{
  const a=await newsToProductPacket(input,{now}),b=await newsToProductPacket(input,{now:now+1000});
  assert.deepEqual(a,b);
  const revision=await newsToProductPacket({...input,text:input.text.replace('25','50')},{now});
  assert.notEqual(a.packet_sha256,revision.packet_sha256);
  const corridor=await newsToProductPacket(input,{now,destination_country_iso3:'CAN'});
  assert.notEqual(a.packet_sha256,corridor.packet_sha256);
  assert.deepEqual(corridor.products.find(p=>p.id==='corridor_digest').canonical_request.subjects,
    [{type:'corridor',origin_country_iso3:'USA',destination_country_iso3:'CAN'}]);
});
test('rejects fake country, future/stale clocks, URL injection and malformed numeric claims',async()=>{
  for(const changed of [{country_iso3:'XXX'},{published_at:'2026-10-28T00:00:00.000Z'},
    {published_at:'2026-10-25T00:00:00.000Z'}])
    await assert.rejects(()=>newsToProductPacket({...input,...changed},{now}));
  await assert.rejects(()=>newsToProductPacket(input,{now,destination_country_iso3:'USA'}));
  const malicious=news();malicious.facts.named_organizations=['https://private.invalid'];
  await assert.rejects(()=>buildNewsProductPacket(malicious,{now}));
  const invalid=news();invalid.facts.numeric_mentions[0].value='NaN';
  await assert.rejects(()=>buildNewsProductPacket(invalid,{now}));
});
function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../workers/control-plane/migrations/0026_reusable_source_news.sql',import.meta.url),'utf8'));
  return {db,DB:{prepare(sql){let params=[];return {bind(...p){params=p;return this},
    async all(){return {results:db.prepare(sql).all(...params)}}};}}};
}
test('private factory reads durable native news with one bounded query and no writes',async()=>{
  const env=d1();const row=news();
  env.db.prepare('INSERT INTO reusable_news_items VALUES(?,?,?,?,?)').run(row.id.slice(5),'macro',input.published_at,JSON.stringify(row),input.published_at);
  const response=await readNewsProductFactory(env,new URLSearchParams(),now);
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.count,1);
  assert.equal(body.packets[0].products.length,12);assert.equal(body.next,null);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM reusable_news_items').get().n,1);
  for(const query of ['limit=41','id=raw','country=USA&country=CAN','before=bad','limit=1&raw=true'])
    assert.equal((await readNewsProductFactory(env,new URLSearchParams(query),now)).status,400);
});
test('worker factory remains behind existing authorization; schedule produces products without a new poller',()=>{
  const worker=readFileSync(new URL('../../workers/control-plane/src/index.mjs',import.meta.url),'utf8');
  assert.ok(worker.indexOf("const auth = authorized(request, env)")<worker.indexOf("url.pathname==='/v1/internal/news-product-factory'"));
  const workflow=readFileSync(new URL('../../.github/workflows/all-source-reusable-news-json.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('artifacts/reusable-source-news/products.json'));
  const producer=readFileSync(new URL('../ops/publish-all-source-reusable-news-json.ts',import.meta.url),'utf8');
  assert.ok(producer.includes('const packet=await buildNewsProductPacket(item,{now:factoryNow})'));
});
test('keyset pagination returns each retained story once and excludes expired input',async()=>{
  const env=d1();
  for(let i=0;i<4;i++){
    const row=news();row.id='news-'+createHash('sha256').update('story-'+i).digest('hex');
    env.db.prepare('INSERT INTO reusable_news_items VALUES(?,?,?,?,?)').run(row.id.slice(5),'macro',input.published_at,JSON.stringify(row),input.published_at);
  }
  const first=await (await readNewsProductFactory(env,new URLSearchParams('limit=2'),now)).json();
  const second=await (await readNewsProductFactory(env,new URLSearchParams({...first.next,limit:'2'}),now)).json();
  assert.equal(first.packets.length,2);assert.equal(second.packets.length,2);assert.equal(second.next,null);
  assert.equal(new Set([...first.packets,...second.packets].map(p=>p.input_id)).size,4);
  const expired=await (await readNewsProductFactory(env,new URLSearchParams(),now+26*3600_000)).json();
  assert.equal(expired.count,0);
  const failed=await readNewsProductFactory({DB:{prepare(){throw Error('private db details')}}},new URLSearchParams(),now);
  assert.equal(failed.status,503);assert.equal((await failed.text()).includes('private db details'),false);
});


test('scheduled all-source factual JSON publisher has Bun shebang before ANY import',()=>{
  // A shebang anywhere other than byte zero parses as an invalid private
  // identifier in Bun. This previously let PR static tests PASS while the
  // REAL protected-main 25h D1 publisher failed with Syntax Error on line 2.
  const producer=readFileSync(new URL('../ops/publish-all-source-reusable-news-json.ts',import.meta.url),'utf8');
  assert.ok(producer.startsWith('#!/usr/bin/env bun\n'), 'Bun executable shebang must be the first line');
  assert.equal(producer.slice(2).includes('#!/usr/bin/env bun'),false,
    'Second shebang would break the 25h publisher at production runtime');
  assert.ok(producer.includes('await collectRegisteredReusableNews('));
  assert.ok(producer.includes('d1_readback_verified'));
  assert.ok(producer.includes('buildNewsProductPacket(item,{now:factoryNow})'));
  assert.equal(producer.includes('settleCoinbaseX402'),false);
});
