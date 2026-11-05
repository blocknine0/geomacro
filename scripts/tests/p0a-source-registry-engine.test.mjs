import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {deflateRawSync} from 'node:zlib';
import {normalizeP0aPayload} from '../../workers/control-plane/src/p0a-source-format.mjs';
import {validateP0aSourceConfig,fetchP0aSource,upsertP0aSourceRegistry,
 pollP0aSources} from '../../workers/control-plane/src/p0a-source-registry.mjs';

const encode=x=>new TextEncoder().encode(x);
const body=(s,{status=200,headers={}}={})=>new Response(status===304||status===403?null:s,{status,headers});
const source=(id,parser_type='RSS_2',overrides={})=>({
 source_id:id,canonical_endpoint:'https://gov.example.org/feed',
 parser_type,intended_category:'GEOPOLITICS',country_iso3:'GLOBAL',
 rights_tier:'RESEARCH_ONLY',polling_interval_sec:300,
 rate_limit_backoff:{max_retries:1,base_delay_ms:100,respect_retry_after:true},
 ...overrides,
});
const news='<rss><channel><item><title>Central bank raises policy interest rates</title>'+
 '<link>https://gov.example.org/article/1</link>'+
 '<pubDate>Sun, 04 Oct 2026 01:00:00 GMT</pubDate></item></channel></rss>';

function dbMock(withP1=false){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../../workers/control-plane/migrations/0113_p0a_source_registry.sql',
  import.meta.url),'utf8'));
 if(withP1)db.exec(readFileSync(new URL(
  '../../workers/control-plane/migrations/0119_p1_source_fanout_585.sql',
  import.meta.url),'utf8'));
 const errors=[];
 const wrap=(sql,args=[])=>({
   bind(...next){return wrap(sql,next)},
   async all(){try{return {results:db.prepare(sql).all(...args)}}catch(err){errors.push({code:err.message,sql:sql.slice(0,90)});throw err}},
   async first(){return db.prepare(sql).get(...args)??null},
   async run(){try{const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes}}}catch(err){errors.push({code:err.message,sql:sql.slice(0,90)});throw err}},
   get sql(){return sql},get args(){return args},
 });
 return {db,errors,env:{DB:{prepare:sql=>wrap(sql),async batch(statements){
  const output=[];
  db.exec('BEGIN');
  try{
   for(const item of statements)output.push({meta:{changes:db.prepare(item.sql).run(...item.args).changes}});
   db.exec('COMMIT');return output;
  }catch(err){console.error('P0A_SQLITE_TEST_ERROR',err.message);db.exec('ROLLBACK');throw err}
 }}}};
}
function zipOne(name,payload,method=8){
 const nameBytes=encode(name),plain=encode(payload),
  packed=method===8?new Uint8Array(deflateRawSync(plain)):plain;
 let crc=-1;
 for(const b of plain){crc^=b;for(let k=0;k<8;k++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}
 crc=(crc^(-1))>>>0;
 const len=30+nameBytes.length+packed.length+46+nameBytes.length+22;
 const bytes=new Uint8Array(len),view=new DataView(bytes.buffer),central=30+nameBytes.length+packed.length;
 const u16=(p,v)=>view.setUint16(p,v,true),u32=(p,v)=>view.setUint32(p,v,true);
 u32(0,0x04034b50);u16(8,method);u32(14,crc);u32(18,packed.length);u32(22,plain.length);
 u16(26,nameBytes.length);bytes.set(nameBytes,30);bytes.set(packed,30+nameBytes.length);
 u32(central,0x02014b50);u16(central+10,method);u32(central+16,crc);
 u32(central+20,packed.length);u32(central+24,plain.length);u16(central+28,nameBytes.length);
 bytes.set(nameBytes,central+46);
 const eocd=central+46+nameBytes.length;
 u32(eocd,0x06054b50);u16(eocd+8,1);u16(eocd+10,1);
 u32(eocd+12,46+nameBytes.length);u32(eocd+16,central);
 return bytes;
}

test('strict D1 registry config and SSRF exclusions',()=>{
 assert.equal(validateP0aSourceConfig(source('src_us_doe')).parser_type,'RSS_2');
 assert.throws(()=>validateP0aSourceConfig(source('src_good','RSS_2',{
  canonical_endpoint:'http://localhost/admin'})),/P0A_SOURCE_CONFIG_INVALID/);
 assert.throws(()=>validateP0aSourceConfig(source('src_good','RSS_2',{
  canonical_endpoint:'https://127.0.0.1/private'})),/P0A_SOURCE_CONFIG_INVALID/);
 assert.throws(()=>validateP0aSourceConfig(source('src_good','GDELT_ZIP')),/P0A_SOURCE_CONFIG_INVALID/);
});
test('RSS 2 XML and native item time',async()=>{
 const rows=await normalizeP0aPayload('RSS_2',encode(news));
 assert.equal(rows.length,1);
 assert.equal(rows[0].native_published_at,'2026-10-04T01:00:00.000Z');
});
test('Atom and RDF native entry time; no feed-level time promotion',async()=>{
 const atom='<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-10-04T01:05:00Z</updated>'+
  '<entry><title>Country announces new export controls</title>'+
  '<published>2026-10-04T01:00:00Z</published>'+
  '<link href="https://gov.example.org/entry"/></entry></feed>';
 const a=await normalizeP0aPayload('ATOM',encode(atom));
 assert.equal(a[0].native_published_at,'2026-10-04T01:00:00.000Z');
 const rdf='<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '+
  'xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Country updates mineral export quota</title>'+
  '<dc:date>2026-10-04T02:00:00Z</dc:date><link>https://gov.example.org/rdf</link></item></rdf:RDF>';
 const r=await normalizeP0aPayload('RDF',encode(rdf));
 assert.equal(r[0].native_published_at,'2026-10-04T02:00:00.000Z');
 assert.equal((await normalizeP0aPayload('ATOM',encode(
  '<feed><updated>2026-10-04T01:00:00Z</updated><entry><title>Undated policy update</title></entry></feed>')))[0].native_published_at,null);
});
test('JSON, quoted CSV, bounded HTML',async()=>{
 const json=await normalizeP0aPayload('JSON_REST',encode(JSON.stringify({results:[
  {title:'Government proposes a tax reform',published_at:'2026-10-04T01:00:00Z',
   url:'https://gov.example.org/json'}]})));
 assert.equal(json[0].original_url,'https://gov.example.org/json');
 const csv=await normalizeP0aPayload('CSV_STREAM',encode(
  'headline,published_at,url\n"Export control, new rule",2026-10-04T01:00:00Z,https://gov.example.org/csv\n'));
 assert.equal(csv[0].title,'Export control, new rule');
 const html=await normalizeP0aPayload('HTML_BOUNDED',encode(
  '<article><time datetime="2026-10-04T01:00:00Z"></time>'+
  '<a href="https://gov.example.org/html">Minister announces lithium policy</a></article>'));
 assert.equal(html[0].native_published_at,'2026-10-04T01:00:00.000Z');
});
test('CSV_STREAM handles a CRC-checked deflated GDELT ZIP without date invention',async()=>{
 const fields=Array(58).fill('');fields[0]='12345';fields[1]='20261104';
 fields[57]='https://gov.example.org/report';
 const parsed=await normalizeP0aPayload('CSV_STREAM',zipOne('events.export.CSV',fields.join('\t')+'\n'));
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].source_record_id,'12345');
 assert.equal(parsed[0].native_published_at,null);
 const bad=zipOne('events.export.CSV',fields.join('\t')+'\n');
 const offset=bad.length-22-46-encode('events.export.CSV').length;bad[offset+16]^=1;
 await assert.rejects(()=>normalizeP0aPayload('CSV_STREAM',bad),/P0A_ZIP_CHECKSUM_INVALID/);
});
test('429/403 never bypass denial through fallback and respect Retry-After',async()=>{
 let calls=0;
 const config=validateP0aSourceConfig(source('src_throttle','RSS_2',{
  fallback_endpoint:'https://fallback.example.org/feed'}));
 const response=await fetchP0aSource(config,{fetchImpl:async()=>{
  calls++;return body(null,{status:429,headers:{'Retry-After':'120'}})
 }});
 assert.equal(response.state,'RATE_LIMITED');
 assert.equal(response.delay,120000);
 assert.equal(calls,1);
 const denied=await fetchP0aSource(config,{fetchImpl:async()=>{
  calls++;return body(null,{status:403})
 }});
 assert.equal(denied.state,'DENIED');assert.equal(calls,2);
});
test('transient 503 retries without aborting the source and parses response',async()=>{
 let calls=0;
 const config=validateP0aSourceConfig(source('src_recovery'));
 const result=await fetchP0aSource(config,{fetchImpl:async()=>{
  calls++;return calls===1?body('offline',{status:503}):body(news);
 }});
 assert.equal(calls,2);assert.equal(result.state,'OBSERVED');assert.equal(result.records.length,1);
});
test('D1 upsert/readback, private staging, failure isolation and subsequent 304 cursor',async()=>{
 const {db,env}=dbMock();let calls=0;
 try{
  const init=await upsertP0aSourceRegistry(env,{sources:[
   source('src_healthy'),source('src_blocked','RSS_2',{
    canonical_endpoint:'https://blocked.example.org/rss'})]});
  assert.equal(init.status,200);
  const receipt=await init.json();assert.equal(receipt.readback_verified,true);
  const tick=await pollP0aSources(env,{now:Date.parse('2026-10-04T02:00:00Z'),
   fetchImpl:async url=>{
    calls++;return String(url).includes('blocked')?body(null,{status:403}):
      body(news,{headers:{etag:'"v2"'}});
   }});
  assert.equal(tick.receipts.length,2);
  assert.equal(tick.receipts.find(x=>x.source_id==='src_healthy').state,'OBSERVED');
  assert.equal(tick.receipts.find(x=>x.source_id==='src_blocked').state,'DENIED');
  assert.equal(db.prepare('SELECT count(*) AS n FROM p0a_normalized_source_items').get().n,1);
  const row=db.prepare("SELECT last_cursor FROM source_registry WHERE source_id='src_healthy'").get();
  assert.equal(row.last_cursor,'etag:"v2"');
  const second=await pollP0aSources(env,{now:Date.parse('2026-10-04T02:06:00Z'),
   fetchImpl:async()=>body(null,{status:304})});
  assert.equal(second.receipts.length,1);
  assert.equal(second.receipts[0].state,'UNCHANGED');
  assert.equal(db.prepare('SELECT count(*) AS n FROM p0a_normalized_source_items').get().n,1);
 }finally{db.close()}
});

test('identical source-registry reseed changes zero physical SQLite rows',async()=>{
 const {db,env}=dbMock();
 try{
  const cfg=source('src_identical');
  assert.equal((await upsertP0aSourceRegistry(env,{sources:[cfg]})).status,200);
  const before=db.prepare('SELECT total_changes() AS n').get().n;
  assert.equal((await upsertP0aSourceRegistry(env,{sources:[cfg]})).status,200);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n-before,0);
  const changed={...cfg,polling_interval_sec:600};
  assert.equal((await upsertP0aSourceRegistry(env,{sources:[changed]})).status,200);
  assert.equal(db.prepare("SELECT polling_interval_sec FROM source_registry WHERE source_id='src_identical'").get().polling_interval_sec,600);
 }finally{db.close()}
});
test('P1 repeated official RSS poll uses bundled item dedupe and six-hour refresh',async()=>{
 const {db,env,errors}=dbMock(true);
 env.GEOMACRO_P1_FANOUT_ENABLED='1';
 env.GEOMACRO_P0A_TEST_DIAGNOSTICS='1';
 try{
  const cfg=source('src_p1_bulk');
  assert.equal((await upsertP0aSourceRegistry(env,{sources:[cfg]})).status,200);
  const start=Date.parse('2026-10-04T02:00:00Z');
  const poll=at=>pollP0aSources(env,{now:at,limit:1,
   sourceIds:['src_p1_bulk'],fetchImpl:async()=>body(news)});
  const first=await poll(start);
  assert.equal(first.receipts[0].state,'OBSERVED',JSON.stringify(errors));
  const initial=db.prepare('SELECT first_seen_at,last_seen_at,item_id FROM p0a_normalized_source_items').get();
  assert.ok(initial);
  assert.equal((await poll(start+6*60000)).receipts[0].state,'OBSERVED');
  const same=db.prepare('SELECT first_seen_at,last_seen_at,item_id FROM p0a_normalized_source_items').get();
  assert.deepEqual(same,initial);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM p0a_normalized_source_items').get().n,1);
  const later=start+7*3600000;
  assert.equal((await poll(later)).receipts[0].state,'OBSERVED');
  const refreshed=db.prepare('SELECT first_seen_at,last_seen_at,item_id FROM p0a_normalized_source_items').get();
  assert.equal(refreshed.first_seen_at,initial.first_seen_at);
  assert.equal(refreshed.item_id,initial.item_id);
  assert.equal(refreshed.last_seen_at,new Date(later).toISOString());
 }finally{db.close()}
});
