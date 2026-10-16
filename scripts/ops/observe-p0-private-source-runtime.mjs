#!/usr/bin/env node
// Activate existing P0 parsers for private discovery; no commercial enablement.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseUkSanctionsXml} from '../../global-intelligence/adapters/uk-sanctions-list.mjs';
import {parseEuSanctionsXml} from '../../global-intelligence/adapters/eu-sanctions.mjs';
import {parseMofcomExportControlHtml} from '../../global-intelligence/adapters/china-mofcom.mjs';
import {parseAustraliaCriticalMineralsHtml} from '../../global-intelligence/adapters/australia-critical-minerals.mjs';
import {parseCochilcoAnuarioHtml} from '../../global-intelligence/adapters/cochilco-minerals.mjs';
import {parseOpcwNewsHtml} from '../../global-intelligence/adapters/opcw-news.mjs';
import {parseIcjCasesHtml} from '../../global-intelligence/adapters/icj-cases.mjs';
import {parseIccNewsHtml} from '../../global-intelligence/adapters/icc-news.mjs';

const PARSERS=Object.freeze({uk_sanctions_list:parseUkSanctionsXml,
 eu_sanctions_consolidated:parseEuSanctionsXml,
 china_mofcom_trade_controls:parseMofcomExportControlHtml,
 australia_critical_minerals:parseAustraliaCriticalMineralsHtml,
 cochilco_minerals:parseCochilcoAnuarioHtml,opcw_news:parseOpcwNewsHtml,
 icj_cases:parseIcjCasesHtml,icc_news:parseIccNewsHtml});
const DOMAINS=['GEOPOLITICS','MACRO','CRITICAL_MINERALS'];
export const P0_MAX_BYTES=2*1024*1024;
// Protected live readback observed the exact UK XML at 22,051,272 bytes.
// Permit bounded growth only for this checked-in first-party dataset.
export const UK_SANCTIONS_MAX_BYTES=32*1024*1024;
export function existingPrivateP0Sources(){
 const registry=JSON.parse(readFileSync(new URL('../../config/global-p0-source-expansion.json',import.meta.url),'utf8'));
 const sources=Object.entries(registry.p0_global_source_expansion.sources);
 if(sources.length!==10 || sources.some(([id,s])=>
   (!Object.hasOwn(PARSERS,id)&&!['world_bank_commodity_prices','unctadstat_global'].includes(id)) ||
   !DOMAINS.includes(s.category)))throw Error('P0_PRIVATE_REGISTRY_INVALID');
 return sources.map(([id,s])=>{
   const url=new URL(s.machine_endpoint??s.dataset_surface??s.discovery_url);
   if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('P0_PRIVATE_ENDPOINT_INVALID');
   return {id,category:s.category,url:url.href};
 });
}
async function boundedBody(response,maxBytes=P0_MAX_BYTES){
 if(Number(response.headers.get('content-length')??0)>maxBytes){
   await response.body?.cancel();throw Error('BODY_SIZE_LIMIT');
 }
 if(!response.body)throw Error('BODY_EMPTY');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){await reader.cancel();throw Error('BODY_SIZE_LIMIT');}
   chunks.push(Buffer.from(value));
 }}finally{reader.releaseLock();}
 if(!size)throw Error('BODY_EMPTY');
 return Buffer.concat(chunks);
}
export async function observeExistingPrivateP0Sources({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('P0_PRIVATE_CLOCK_INVALID');
 const results=[];
 for(const source of existingPrivateP0Sources()){
   const row={source_id:source.id,category:source.category,request_attempted:true,
     status:'UNAVAILABLE',reason:null,parsed_candidate_count:null,
     current_original_publication_verified:false,commercial_eligible:false};
   try{
     const response=await fetchImpl(source.url,{method:'GET',redirect:'error',
       signal:AbortSignal.timeout(15000),headers:{'user-agent':'Geomacro-Private-P0-Discovery/1.0'}});
     if(!response.ok){row.reason='HTTP_'+response.status;await response.body?.cancel();}
     else{
       const isUkDataset=source.id==='uk_sanctions_list'&&
         source.url==='https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml';
       const bytes=await boundedBody(response,isUkDataset?UK_SANCTIONS_MAX_BYTES:P0_MAX_BYTES);
       const type=response.headers.get('content-type')??'';
       if(source.id==='world_bank_commodity_prices'){
         if(bytes.length<100||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('FORMAT_NOT_VERIFIED');
         // ZIP signature is transport only, never parsed commodity data.
         row.status='DATASET_TRANSPORT_ONLY';
       }else{
         const xml=source.id==='uk_sanctions_list'||source.id==='eu_sanctions_consolidated';
         if(!(xml?/xml/iu:/html/iu).test(type))throw Error('FORMAT_NOT_VERIFIED');
         const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
         if(source.id==='unctadstat_global'){
           if(!/<(?:html|!doctype)/iu.test(text))throw Error('FORMAT_NOT_VERIFIED');
           row.status='HTML_CONTEXT_ONLY';
         }else{
           if(xml&&/<!DOCTYPE|<!ENTITY/iu.test(text))throw Error('FORMAT_NOT_VERIFIED');
           let parsed;
           try{parsed=PARSERS[source.id](text,{retrievedAt:now.toISOString(),observedAt:now.toISOString()});}
           catch{throw Error('PARSER_NOT_VERIFIED');}
           const count=Array.isArray(parsed)?parsed.length:Number(parsed?.value_numeric);
           if(!Number.isSafeInteger(count)||count<1)throw Error('PARSER_NOT_VERIFIED');
           row.status='PRIVATE_CANDIDATES_PARSED';row.parsed_candidate_count=count;
         }
       }
     }
   }catch(error){
     const allowed=['BODY_SIZE_LIMIT','BODY_EMPTY','FORMAT_NOT_VERIFIED','PARSER_NOT_VERIFIED'];
     row.reason=allowed.includes(error?.message)?error.message:'NETWORK_OR_REDIRECT_UNAVAILABLE';
   }
   results.push(row);
 }
 const unavailable=results.filter(r=>r.status==='UNAVAILABLE').length;
 return {schema:'geomacro.existing-p0-private-source-runtime.v1',observed_at:now.toISOString(),
   status:unavailable?'PRIVATE_DISCOVERY_PARTIALLY_DEGRADED':'PRIVATE_DISCOVERY_OBSERVED',
   source_count:results.length,http_requests:results.length,unavailable,
   parsed_sources:results.filter(r=>r.status==='PRIVATE_CANDIDATES_PARSED').length,
   per_domain:Object.fromEntries(DOMAINS.map(d=>[d,{
     attempted:results.filter(r=>r.category===d).length,
     available:results.filter(r=>r.category===d&&r.status!=='UNAVAILABLE').length}])),
   results,raw_publisher_content_persisted:false,source_rights_approved:false,
   source_publication_clocks_requalified:false,signed_intelligence_published:false,
   commercial_eligible:false,supabase_requests:0,b2_requests:0,d1_writes:0,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
   const receipt=await observeExistingPrivateP0Sources();
   mkdirSync('artifacts/p0-private-source-runtime',{recursive:true,mode:0o700});
   writeFileSync('artifacts/p0-private-source-runtime/receipt.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
   console.log(JSON.stringify(receipt));
   if(receipt.unavailable)process.exitCode=3;
 }catch{console.error('P0_PRIVATE_SOURCE_RUNTIME_FAILED');process.exitCode=2;}
}
