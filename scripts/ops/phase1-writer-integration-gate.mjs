#!/usr/bin/env node
/**
 * Mandatory release invariant: every statically discoverable production D1
 * writer must be listed and hash-reviewed with real atomic admission integration.
 * Unknown or unlisted writers keep the release gate closed.
 */
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative,sep} from 'node:path';

const SCAN_ROOTS=Object.freeze(['.']);
const SOURCE=/\.(?:mjs|js|cjs|ts|tsx|jsx|py|sh|bash|ps1|ya?ml|json|jsonc)$/u;
const D1_CALL=/\b([A-Za-z_$][\w$]*)\s*(?:\?\.)?\.\s*(?:prepare|batch|exec)\s*\(/gu;
const D1_BINDING_ALIAS=/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\s*(?:\?\.)?\.\s*DB\b/gu;
const D1_ALIAS_ASSIGNMENT=/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/gu;
const D1_REST_ENDPOINT=/(?:https?:\/\/)?api\.cloudflare\.com\/client\/v4\/accounts\/[^\s"']+\/d1\/database\/[^\s"']+\/query|\/d1\/database\/[^\s"']+\/query/iu;
function accessesD1(source){
 if(D1_REST_ENDPOINT.test(source))return true;
 const aliases=new Set(['DB']);
 let changed=true;
 while(changed){
  changed=false;
  D1_BINDING_ALIAS.lastIndex=0;
  for(const match of source.matchAll(D1_BINDING_ALIAS))
   if(!aliases.has(match[1])){aliases.add(match[1]);changed=true;}
  D1_ALIAS_ASSIGNMENT.lastIndex=0;
  for(const match of source.matchAll(D1_ALIAS_ASSIGNMENT))
   if(aliases.has(match[2])&&!aliases.has(match[1])){aliases.add(match[1]);changed=true;}
 }
 D1_CALL.lastIndex=0;
 for(const match of source.matchAll(D1_CALL))
  if(aliases.has(match[1]))return true;
 return false;
}
const SQL_WRITE=/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE\s+[\w".`]+|DELETE\s+FROM|REPLACE\s+INTO)\b/iu;
const SQL_READ=/\bSELECT\b/iu;
const DIRECT_D1_COMMAND=/\bwrangler\s+d1\s+execute\b/iu;
function filesUnder(root){
 const out=[];
 function walk(dir){
  let entries;
  try{entries=readdirSync(dir,{withFileTypes:true})}catch{return}
  for(const entry of entries){
   if(['.git','node_modules','vendor','dist','build','coverage','.next','.wrangler'].includes(entry.name))continue;
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
  const d1Access=accessesD1(source)||DIRECT_D1_COMMAND.test(source);
  const write=d1Access&&SQL_WRITE.test(source);
  const read=d1Access&&SQL_READ.test(source);
  const unknown=d1Access&&!write&&!read;
  if(!d1Access)continue;
  const normalized=relative('.',path).split(sep).join('/');
  candidates.set(normalized,{sha256:createHash('sha256').update(source).digest('hex'),write,read,unknown});
 }
}

const doc=JSON.parse(readFileSync('config/phase1-writer-integration.json','utf8'));
if(doc.schema!=='geomacro.phase1.d1-writer-integration.v1'||
 !Array.isArray(doc.producers)||!Array.isArray(doc.readers)){
 throw Error('CANARY_WRITER_INVENTORY_INVALID');
}
const seen=new Set();
for(const p of doc.producers){
 if(typeof p.path!=='string'||!/^((workers|scripts|src)\/)[\w./-]+\.(?:mjs|js|cjs|ts|sh|yml|yaml)$/.test(p.path)||
    seen.has(p.path)||!Array.isArray(p.direct_write_references)||
    !p.direct_write_references.length||!p.admission_helper_import||
    !/^[a-f0-9]{64}$/.test(p.reviewed_sha256??'')){
  throw Error('CANARY_WRITER_INVENTORY_INVALID');
 }
 seen.add(p.path);
 const source=readFileSync(p.path,'utf8');
 const hash=createHash('sha256').update(source).digest('hex');
 const candidate=candidates.get(p.path);
 if(!candidate?.write||hash!==p.reviewed_sha256||
    !source.includes(p.admission_helper_import)||
    p.direct_write_references.some(s=>typeof s!=='string'||!source.includes(s))){
  throw Error('CANARY_WRITER_ATOMIC_ADMISSION_DRIFT:'+p.path);
 }
}
const readerSeen=new Set();
for(const p of doc.readers){
 if(typeof p.path!=='string'||!/^((workers|scripts|src)\/)[\w./-]+\.(?:mjs|js|cjs|ts|sh|yml|yaml)$/.test(p.path)||
    readerSeen.has(p.path)||!Array.isArray(p.direct_read_references)||
    !p.direct_read_references.length||!p.read_admission_helper_import||
    !/^[a-f0-9]{64}$/.test(p.reviewed_sha256??''))
  throw Error('CANARY_READER_INVENTORY_INVALID');
 readerSeen.add(p.path);
 const source=readFileSync(p.path,'utf8');
 const hash=createHash('sha256').update(source).digest('hex');
 const candidate=candidates.get(p.path);
 if(!candidate?.read||hash!==p.reviewed_sha256||
    !source.includes(p.read_admission_helper_import)||
    p.direct_read_references.some(s=>typeof s!=='string'||!source.includes(s)))
  throw Error('CANARY_READER_ATOMIC_ADMISSION_DRIFT:'+p.path);
}
const uncovered=[...candidates].filter(([path,c])=>
 (c.write&&!seen.has(path))||(c.read&&!readerSeen.has(path))||c.unknown);
if(uncovered.length){
 console.log(JSON.stringify({schema:'geomacro.phase1.d1-access-scan.v1',verified:false,
  candidate_count:candidates.size,
  uncovered:uncovered.map(([path,c])=>({path,sha256:c.sha256,read:c.read,write:c.write}))}));
 throw Error('CANARY_DISCOVERED_D1_ACCESS_PATHS_NOT_REVIEWED:'+uncovered.length);
}
if(doc.account_wide_governor_verified!==true||doc.producers.length<3||
   doc.account_wide_read_cap_verified!==true||doc.readers.length<1){
 console.log(JSON.stringify({
  schema:'geomacro.phase1.d1-access-scan.v1',
  verified:false,
  candidate_count:candidates.size,writer_count:doc.producers.length,reader_count:doc.readers.length,
  reviewed_writers:doc.producers.length,reviewed_readers:doc.readers.length,
  candidates:[...candidates].map(([path,entry])=>({path,...entry})),
 }));
 throw Error('CANARY_ALL_D1_PRODUCERS_NOT_ATOMICALLY_GOVERNED');
}
console.log(JSON.stringify({
 schema:'geomacro.phase1.d1-access-scan.v1',
 verified:true,
 candidate_count:candidates.size,
  reviewed_writers:doc.producers.length,reviewed_readers:doc.readers.length,
}));
