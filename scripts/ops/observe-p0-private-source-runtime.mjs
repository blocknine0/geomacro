#!/usr/bin/env node
// Activate existing P0 parsers for private discovery; no commercial enablement.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {parseUkSanctionsXml} from '../../global-intelligence/adapters/uk-sanctions-list.mjs';
import {parseEuSanctionsXml,EU_SANCTIONS_URL} from '../../global-intelligence/adapters/eu-sanctions.mjs';
import {parseMofcomExportControlHtml} from '../../global-intelligence/adapters/china-mofcom.mjs';
import {parseAustraliaCriticalMineralsHtml} from '../../global-intelligence/adapters/australia-critical-minerals.mjs';
import {parseCochilcoAnuarioHtml} from '../../global-intelligence/adapters/cochilco-minerals.mjs';
import {parseOpcwNewsHtml} from '../../global-intelligence/adapters/opcw-news.mjs';
import {parseIcjCasesHtml} from '../../global-intelligence/adapters/icj-cases.mjs';
import {parseIccArticleHtml,parseIccNewsHtml} from '../../global-intelligence/adapters/icc-news.mjs';
import {parseUnctadPublisherReleaseMetadata} from '../../global-intelligence/adapters/unctadstat.mjs';
import {ICC_OFFICIAL_NEWS_RSS,extractIccOfficialNewsLinks,parseIccOfficialNewsRss}
 from '../lib/icc-official-news-rss.mjs';
import {MOFCOM_MINISTRY_ANNOUNCEMENTS_2026,
 parseMofcomMinistryMineralAnnouncementIndex}
 from '../lib/mofcom-ministry-2026-announcements.mjs';

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
// The official public EU XML was measured at 25,767,041 bytes.
export const EU_SANCTIONS_MAX_BYTES=32*1024*1024;
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
 let totalHttpRequests=0;
 for(const source of existingPrivateP0Sources()){
   const row={source_id:source.id,category:source.category,request_attempted:true,
     status:'UNAVAILABLE',reason:null,parsed_candidate_count:null,
     current_original_publication_verified:false,commercial_eligible:false};
   let mayUseRelatedMinistryIndex=false;
   let mayUseCourtRss=false;
   try{
     totalHttpRequests++;
     const response=await fetchImpl(source.url,{method:'GET',redirect:'error',
       signal:AbortSignal.timeout(15000),headers:{'user-agent':'Geomacro-Private-P0-Discovery/1.0'}});
     if(!response.ok){
       row.reason='HTTP_'+response.status;
       mayUseRelatedMinistryIndex=[500,502,503,504].includes(response.status);
       try{await response.body?.cancel();}catch{}
     }
     else{
       const isUkDataset=source.id==='uk_sanctions_list'&&
         source.url==='https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml';
       const isEuDataset=source.id==='eu_sanctions_consolidated'&&source.url===EU_SANCTIONS_URL;
       const bytes=await boundedBody(response,isUkDataset?UK_SANCTIONS_MAX_BYTES:
         isEuDataset?EU_SANCTIONS_MAX_BYTES:P0_MAX_BYTES);
       const type=response.headers.get('content-type')??'';
       if(source.id==='world_bank_commodity_prices'){
         if(bytes.length<100||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('FORMAT_NOT_VERIFIED');
         // ZIP signature is transport only, never parsed commodity data.
         row.status='DATASET_TRANSPORT_ONLY';
         row.reason='WORLD_BANK_XLSX_TRANSPORT_ONLY_NO_NATIVE_RELEASE_CLOCK';
       }else{
         const xml=source.id==='uk_sanctions_list'||source.id==='eu_sanctions_consolidated';
         const unctad=source.id==='unctadstat_global';
         if(!(xml?/xml/iu:(unctad?/html|json/iu:/html/iu)).test(type))throw Error('FORMAT_NOT_VERIFIED');
         const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
         if(unctad){
           if(/json/iu.test(type)){
             let payload;try{payload=JSON.parse(text)}catch{throw Error('UNCTAD_MACHINE_JSON_INVALID')}
             const clock=parseUnctadPublisherReleaseMetadata(payload);
             row.status='MACHINE_DATA_METADATA_PARSED';row.native_release_clock_verified=true;
             row.publisher_release_at_utc=clock.published_at;row.reason=null;
           }else if(/<(?:html|!doctype)/iu.test(text)){
             row.status='HTML_CONTEXT_ONLY';
             row.reason='UNCTAD_HTML_CONTEXT_NO_MACHINE_RELEASE_METADATA';
           }else throw Error('FORMAT_NOT_VERIFIED');
         }else{
           if(xml&&/<!DOCTYPE|<!ENTITY/iu.test(text))throw Error('FORMAT_NOT_VERIFIED');
           let parsed;
           try{parsed=PARSERS[source.id](text,{retrievedAt:now.toISOString(),observedAt:now.toISOString()});}
           catch{
             // A changed news landing-page DOM may hide the ICC news anchors;
             // the SAME court explicitly publishes a separate RSS feed.
             // Do not let format, denial or unrelated parser failures retry.
             mayUseCourtRss=source.id==='icc_news';
             throw Error(source.id==='icc_news'?'ICC_NEWS_LISTING_PARSE_FAILED':'PARSER_NOT_VERIFIED');
           }
           const count=Array.isArray(parsed)?parsed.length:Number(parsed?.value_numeric);
           if(!Number.isSafeInteger(count)||count<1)throw Error('PARSER_NOT_VERIFIED');
           row.status='PRIVATE_CANDIDATES_PARSED';row.parsed_candidate_count=count;
         }
       }
     }
   }catch(error){
     const allowed=['BODY_SIZE_LIMIT','BODY_EMPTY','FORMAT_NOT_VERIFIED','PARSER_NOT_VERIFIED','ICC_NEWS_LISTING_PARSE_FAILED'];
     row.reason=allowed.includes(error?.message)?error.message:
       (/^ICC_(?:ARTICLE|OFFICIAL_RSS)_[A-Z0-9_]+$/u.test(error?.message??'')?error.message:
       (error?.name==='TimeoutError'?'UPSTREAM_TIMEOUT':
       (error?.name==='TypeError'?'UPSTREAM_NETWORK_ERROR':'NETWORK_OR_REDIRECT_UNAVAILABLE')));
     // Only a transport-level failure may trigger a second, *different*
     // first-party MOFCOM surface, never denied/quota or malformed content.
     mayUseRelatedMinistryIndex=error?.name==='AbortError' ||
       error?.name==='TimeoutError' || error?.name==='TypeError';
   }
   if(source.id==='icc_news'&&row.status==='UNAVAILABLE'&&
      ['PARSER_NOT_VERIFIED','ICC_NEWS_LISTING_PARSE_FAILED'].includes(row.reason)&&mayUseCourtRss){
     totalHttpRequests++;
     row.official_rss_alternate_attempted=true;
     row.primary_news_html_parser_still_unverified=true;
     try{
       const alt=await fetchImpl(ICC_OFFICIAL_NEWS_RSS,{
         method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
         headers:{'user-agent':'Geomacro-Private-P0-Discovery/1.0',
          accept:'application/rss+xml,application/xml,text/xml'}
       });
       if(!alt.ok||alt.redirected===true||
          (alt.url&&alt.url!==ICC_OFFICIAL_NEWS_RSS)){
         try{await alt.body?.cancel();}catch{}
         throw Error('ICC_OFFICIAL_RSS_ENDPOINT_UNVERIFIED');
       }
       if(!/xml|rss/iu.test(alt.headers.get('content-type')??''))
         throw Error('ICC_OFFICIAL_RSS_MIME_INVALID');
       const bytes=await boundedBody(alt,P0_MAX_BYTES);
       const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
       const receipt=parseIccOfficialNewsRss(text);
       const [articleUrl]=extractIccOfficialNewsLinks(text,{limit:1});
       totalHttpRequests++;
       const article=await fetchImpl(articleUrl,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
         headers:{'user-agent':'Geomacro-Private-P0-Discovery/1.0','accept':'text/html'} });
       if(!article.ok||article.redirected===true||new URL(article.url||articleUrl).hostname!=='www.icc-cpi.int'){
         try{await article.body?.cancel();}catch{}
         row.reason=`ICC_ARTICLE_HTTP_${Number.isInteger(article.status)?article.status:0}`;
         throw Error('ICC_ARTICLE_HTTP_UNAVAILABLE');
       }
       if(!/html/iu.test(article.headers.get('content-type')??'')){
         try{await article.body?.cancel();}catch{}
         row.reason='ICC_ARTICLE_MIME_INVALID';throw Error('ICC_ARTICLE_MIME_INVALID');
       }
       const articleBytes=await boundedBody(article,P0_MAX_BYTES);
       const articleHtml=new TextDecoder('utf-8',{fatal:true}).decode(articleBytes);
       const parsedArticle=parseIccArticleHtml(articleHtml,{url:articleUrl,retrievedAt:now.toISOString()});
       row.status='PRIVATE_CANDIDATES_PARSED';row.parsed_candidate_count=1;
       row.reason=null;row.original_article_html_readback_verified=true;
       row.primary_news_html_parser_still_unverified=false;
       row.current_original_publication_verified=parsedArticle.published_at!==null;
       row.native_publication_at_utc=parsedArticle.published_at;
       row.official_first_party_rss_leads=receipt.first_party_original_link_leads;
       row.commercial_eligible=false;
     }catch(error){
       row.official_rss_alternate_unavailable=true;
       row.icc_fallback_reason=/^ICC_(?:OFFICIAL_RSS|ARTICLE)_[A-Z0-9_]+$/u.test(error?.message??'')?error.message:
         (typeof row.reason==='string'?row.reason:'ICC_FALLBACK_UNAVAILABLE');
       // Preserve sanitized source-native failure codes; no publisher content.
     }
   }
   if(source.id==='china_mofcom_trade_controls'&&
      row.status==='UNAVAILABLE'&&mayUseRelatedMinistryIndex){
     totalHttpRequests++;
     row.related_ministry_index_attempted=true;
     row.primary_endpoint_still_unavailable=true;
     try{
       const alternate=await fetchImpl(MOFCOM_MINISTRY_ANNOUNCEMENTS_2026,{
         method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
         headers:{'user-agent':'Geomacro-Private-P0-Discovery/1.0'}
       });
       if(!alternate.ok||alternate.redirected===true ||
          (alternate.url&&alternate.url!==MOFCOM_MINISTRY_ANNOUNCEMENTS_2026)){
         try{await alternate.body?.cancel();}catch{}
         throw Error('MOFCOM_MINISTRY_ALTERNATE_NOT_VERIFIED');
       }
       if(!/html/iu.test(alternate.headers.get('content-type')??''))
         throw Error('MOFCOM_MINISTRY_ALTERNATE_MIME_INVALID');
       const bytes=await boundedBody(alternate,P0_MAX_BYTES);
       const doc=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
       const receipt=parseMofcomMinistryMineralAnnouncementIndex(doc);
       row.status='RELATED_MINISTRY_INDEX_REFERENCE_ONLY';
       row.reason=null;
       row.related_ministry_original_index_leads=
         receipt.mineral_export_control_original_article_lead_count;
       row.related_ministry_original_article_page_verified=false;
       row.related_ministry_index_does_not_restore_primary=true;
       row.current_original_publication_verified=false;
       row.commercial_eligible=false;
     }catch{
       row.related_ministry_reference_unavailable=true;
       // Keep original failure, do not leak private exception/HTML.
     }
   }
   results.push(row);
 }
 const unavailable=results.filter(r=>r.status==='UNAVAILABLE').length;
 return {schema:'geomacro.existing-p0-private-source-runtime.v1',observed_at:now.toISOString(),
   status:unavailable?'PRIVATE_DISCOVERY_PARTIALLY_DEGRADED':'PRIVATE_DISCOVERY_OBSERVED',
   source_count:results.length,http_requests:totalHttpRequests,unavailable,
   related_index_reference_is_not_primary_source_restoration:true,
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
