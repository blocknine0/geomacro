#!/usr/bin/env node
/**
 * Mandatory release invariant: every statically discoverable production D1
 * writer must be listed and hash-reviewed with real atomic admission integration.
 * Unknown or unlisted writers keep the release gate closed.
 */
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative,sep} from 'node:path';

const SCAN_ROOTS=Object.freeze(['workers','src','scripts']);
const SOURCE=/\.(?:mjs|js|cjs|ts|sh|ya?ml|sql)$/u;
const D1_API=/(?:\.\s*(?:prepare|batch|exec)\s*\(|\/d1\/database\/|\bD1_DATABASE_ID\b)/iu;
const SQL_WRITE=/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE\s+[\w".`]+|DELETE\s+FROM|REPLACE\s+INTO)\b/iu;
const DIRECT_D1_COMMAND=/\bwrangler\s+d1\s+(?:execute|migrations)\b/iu;
function filesUnder(root){
 const out=[];
 function walk(dir){
  let entries;
  try{entries=readdirSync(dir,{withFileTypes:true})}catch{return}
  for(const entry of entries){
   if(entry.name==='node_modules'||entry.name==='vendor'||entry.name.startsWith('.'))continue;
   const path=join(dir,entry.name);
   if(entry.isDirectory()){walk(path);continue}
   if(!entry.isFile()||!SOURCE.test(entry.name)||/(?:^|[./_-])test(?:[./_-]|$)|__tests__/iu.test(path))continue;
   out.push(path);
  }
 }
 walk(root);
 return out;
}
const candidates=new Map();
for(const root of SCAN_ROOTS){
 for(const path of filesUnder(root)){
  let source;
  try{source=readFileSync(path,'utf8')}catch{throw Error('CANARY_WRITER_SCAN_READ_FAILED:'+path)}
  if(!((D1_API.test(source)&&SQL_WRITE.test(source))||
       (DIRECT_D1_COMMAND.test(source)&&SQL_WRITE.test(source))||
       (path.endsWith('.sql')&&SQL_WRITE.test(source))))continue;
  const normalized=relative('.',path).split(sep).join('/');
  candidates.set(normalized,createHash('sha256').update(source).digest('hex'));
 }
}

const doc=JSON.parse(readFileSync('config/phase1-writer-integration.json','utf8'));
if(doc.schema!=='geomacro.phase1.d1-writer-integration.v1'||
 !Array.isArray(doc.producers)){
 throw Error('CANARY_WRITER_INVENTORY_INVALID');
}
const seen=new Set();
for(const p of doc.producers){
 if(typeof p.path!=='string'||!/^((workers|scripts|src)\/)[\w./-]+\.(?:mjs|js|cjs|ts|sh|yml|yaml|sql)$/.test(p.path)||
    seen.has(p.path)||!Array.isArray(p.direct_write_references)||
    !p.direct_write_references.length||!p.admission_helper_import||
    !/^[a-f0-9]{64}$/.test(p.reviewed_sha256??'')){
  throw Error('CANARY_WRITER_INVENTORY_INVALID');
 }
 seen.add(p.path);
 const source=readFileSync(p.path,'utf8');
 const hash=createHash('sha256').update(source).digest('hex');
 if(hash!==p.reviewed_sha256||
    !source.includes(p.admission_helper_import)||
    p.direct_write_references.some(s=>typeof s!=='string'||!source.includes(s))){
  throw Error('CANARY_WRITER_ATOMIC_ADMISSION_DRIFT:'+p.path);
 }
}
const uncovered=[...candidates.keys()].filter(path=>!seen.has(path));
if(uncovered.length){
 console.log(JSON.stringify({
  schema:'geomacro.phase1.d1-writer-scan.v1',
  verified:false,
  candidate_count:candidates.size,
  uncovered:candidates.size?uncovered.map(path=>({path,sha256:candidates.get(path)})):[],
 }));
 throw Error('CANARY_DISCOVERED_D1_WRITERS_NOT_REVIEWED:'+uncovered.length);
}
if(doc.account_wide_governor_verified!==true||doc.producers.length<3){
 console.log(JSON.stringify({
  schema:'geomacro.phase1.d1-writer-scan.v1',
  verified:false,
  candidate_count:candidates.size,
  reviewed_count:doc.producers.length,
  candidates:[...candidates].map(([path,sha256])=>({path,sha256})),
 }));
 throw Error('CANARY_ALL_D1_PRODUCERS_NOT_ATOMICALLY_GOVERNED');
}
console.log(JSON.stringify({
 schema:'geomacro.phase1.d1-writer-scan.v1',
 verified:true,
 candidate_count:candidates.size,
 reviewed_count:doc.producers.length,
}));
