#!/usr/bin/env node
/**
 * Mandatory release invariant: all known independent D1 write families must
 * show real checked-in atomic admission integration. Unknown means HOLD.
 */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const doc=JSON.parse(readFileSync('config/phase1-writer-integration.json','utf8'));
if(doc.schema!=='geomacro.phase1.d1-writer-integration.v1'||
 doc.account_wide_governor_verified!==true||
 !Array.isArray(doc.producers)||doc.producers.length<3)
 throw Error('CANARY_ALL_D1_PRODUCERS_NOT_ATOMICALLY_GOVERNED');
const REQUIRED_WRITER_FAMILIES=Object.freeze([
 'workers/control-plane/src/website-derived-intelligence.mjs',
 'workers/control-plane/src/private-osint-15m.mjs',
 'workers/control-plane/src/hot50-materialized-news.mjs',
 'workers/control-plane/src/materialized-public-news-pages.mjs',
 'workers/control-plane/src/customer-runtime.mjs',
 'workers/control-plane/src/phase2h-private-raw-news.mjs',
 'workers/control-plane/src/unified-risk-gate.mjs',
 'workers/control-plane/src/predge-risk-gate-d1.mjs',
 'workers/control-plane/src/p1-source-fanout.mjs',
 'src/workers/ingest-consumer.ts',
]);
const seen=new Set();
for(const p of doc.producers){
 if(typeof p.path!=='string'||!/^((workers|scripts|src)\/)[\w./-]+\.(?:mjs|ts)$/.test(p.path)||
    seen.has(p.path)||!Array.isArray(p.direct_write_references)||
    !p.direct_write_references.length||!p.admission_helper_import||
    !/^[a-f0-9]{64}$/.test(p.reviewed_sha256??''))
  throw Error('CANARY_WRITER_INVENTORY_INVALID');
 seen.add(p.path);
 const source=readFileSync(p.path,'utf8');
 const hash=createHash('sha256').update(source).digest('hex');
 if(hash!==p.reviewed_sha256 ||
   !source.includes(p.admission_helper_import)||
   p.direct_write_references.some(s=>typeof s!=='string'||!source.includes(s)))
  throw Error('CANARY_WRITER_ATOMIC_ADMISSION_DRIFT:'+p.path);
}
if(REQUIRED_WRITER_FAMILIES.some(p=>!seen.has(p)))
 throw Error('CANARY_REQUIRED_WRITER_FAMILY_NOT_REVIEWED');
console.log('CANARY_INVENTORIED_D1_WRITERS_ATOMIC_GOVERNOR_REVIEWED');
