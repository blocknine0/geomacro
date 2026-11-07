#!/usr/bin/env node
/** Genuine-source Hot50/3-category attestation; never self-certify story truth. */
import {readFileSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {HOT50,CATEGORIES,SHA_RE,need,canonical,sha256,signedReport,holdError} from '../../scripts/release-common.ts';
import {verifyPinnedFactsOnlyGriV12Proof} from '../../scripts/lib/facts-only-gri-v12-dual-attestation.mjs';

type Publisher={url:string;issuer_hostname:string;publisher_org_id:string;original_published_at:string;
 page_sha256:string;source_rights_record_sha256:string};
type Event={country_iso3:string;category:string;event_fingerprint:string;fact_claim_terms:string[];
 factual_record_sha256:string;publisher_sources:Publisher[];facts_rights_proof:unknown};
const MAX_ITEMS=150,MAX_BYTES=400000,MAX_AGE=72*3600000;
const fresh=(s:string,now:number)=>{
 const n=Date.parse(s);return Number.isFinite(n)&&n<=now&&now-n<=MAX_AGE&&
  new Date(n).toISOString()===s;
};
const hostname=(raw:string)=>{
 const u=new URL(raw);
 const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 // External evidence must never be a request to localhost, link-local,
 // metadata hosts, a bare internal name or a URL with hidden credentials.
 // Full issuer provenance is separately bound to TWO independently signed
 // machine facts/rights attestations before any network fetch.
 need(u.protocol==='https:'&&!u.username&&!u.password&&u.port===''&&
  host.includes('.')&&!isIP(host)&&
  !/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|arpa)$/u.test(host),
  'HOT50_ORIGINAL_PUBLIC_HTTPS_REQUIRED');
 return host;
};
function publishedInPage(html:string,date:string){
 const matches=[...html.matchAll(/<(?:meta|time)\b[^>]{0,1000}>/giu)].map(m=>m[0]);
 const tokens=matches.filter(s=>/article:published_time|datePublished|pubdate|date-published|datetime\s*=/iu.test(s));
 const dt=Date.parse(date);
 return tokens.some(t=>{
  const found=/(?:content|datetime)\s*=\s*["']([^"']{8,80})["']/iu.exec(t)?.[1];
  return found&&Number.isFinite(Date.parse(found))&&Math.abs(Date.parse(found)-dt)<=60000;
 });
}
async function checkOriginal(source:Publisher,event:Event,now:number){
 const host=hostname(source.url);
 need(source.issuer_hostname===host&&source.publisher_org_id?.length>=5&&source.publisher_org_id.length<=100&&
  SHA_RE.test(source.page_sha256)&&SHA_RE.test(source.source_rights_record_sha256)&&fresh(source.original_published_at,now),
  'HOT50_SOURCE_IDENTITY_OR_TIME_INVALID');
 const res=await fetch(source.url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
  headers:{Accept:'text/html,application/xhtml+xml'}});
 need(res.status===200&&!res.redirected&&/text\/html|application\/xhtml\+xml/.test(res.headers.get('content-type')||''),
  'HOT50_ORIGINAL_SOURCE_NOT_READABLE');
 const bytes=Buffer.from(await res.arrayBuffer());need(bytes.length>0&&bytes.length<=MAX_BYTES,'HOT50_ORIGINAL_TOO_LARGE');
 need(sha256(bytes)===source.page_sha256,'HOT50_ORIGINAL_SHA256_MISMATCH');
 const html=bytes.toString('utf8');
 need(!/<!DOCTYPE\s+[^>]*\[/iu.test(html)&&publishedInPage(html,source.original_published_at),'HOT50_ORIGINAL_NATIVE_DATE_UNVERIFIED');
 const normalized=html.replace(/<[^>]+>/gu,' ').replace(/\s+/gu,' ').toLocaleLowerCase('en');
 for(const term of event.fact_claim_terms){
  need(term.length>=4&&term.length<=80&&/^[\p{L}\p{N} .,'-]+$/u.test(term),'HOT50_CLAIM_TERM_INVALID');
  need(normalized.includes(term.toLocaleLowerCase('en')),'HOT50_SAME_EVENT_FACT_NOT_FOUND');
 }
 return {publisher_org_id:source.publisher_org_id,issuer_hostname:host,
  original_published_at:source.original_published_at,original_body_sha256:source.page_sha256,
  rights_record_sha256:source.source_rights_record_sha256,independent_native_page_readback:true};
}
/** Bind the existing dual-signed facts/rights record to THIS event and
 * THESE exact independently fetched original publisher objects. A valid
 * unrelated signature must never authorize another event or country.
 * This mapping is a structural prerequisite, not an independent trust claim.
 */
export function verifyCorroborationBinding(e:Event):boolean{
 const source:any=e?.facts_rights_proof;
 if(!source||typeof source!=='object'||Array.isArray(source)||
  source.countryIso3!==e.country_iso3||
  source.factualRecordSha256!==e.factual_record_sha256||
  source.independentSameEventVerified!==true||
  source.sourceNativeTimeVerified!==true||
  !Array.isArray(source.independentEvidence))return false;
 const matched=new Set<string>();
 for(const original of e.publisher_sources??[]){
  const hits=source.independentEvidence.filter((x:any)=>
   x?.url===original.url&&x?.contentSha256===original.page_sha256&&
   x?.issuer===original.publisher_org_id&&
   x?.independentlyFetched===true&&x?.issuerVerified===true&&
   x?.sameEventVerified===true&&x?.factVerified===true&&
   x?.licenceOrPublicDomainVerified===true&&
   x?.thirdPartyMaterialExcluded===true);
  if(hits.length!==1||matched.has(original.publisher_org_id))return false;
  matched.add(original.publisher_org_id);
 }
 return matched.size>=3;
}
function validateEvent(e:Event,now:number){
 need(HOT50.includes(e.country_iso3)&&CATEGORIES.includes(e.category)&&SHA_RE.test(e.event_fingerprint)&&
  SHA_RE.test(e.factual_record_sha256)&&Array.isArray(e.fact_claim_terms)&&e.fact_claim_terms.length>=3&&e.fact_claim_terms.length<=6&&
  Array.isArray(e.publisher_sources)&&e.publisher_sources.length>=3&&e.publisher_sources.length<=6,
  'HOT50_EVENT_METADATA_INVALID');
 need(new Set(e.publisher_sources.map(s=>s.publisher_org_id)).size===e.publisher_sources.length&&
  new Set(e.publisher_sources.map(s=>hostname(s.url))).size===e.publisher_sources.length&&
  new Set(e.publisher_sources.map(s=>s.page_sha256)).size===e.publisher_sources.length,
  'HOT50_INDEPENDENT_PRIMARY_PUBLISHERS_NOT_DISTINCT');
 // Pinned existing methodology recomputes score evidence and verifies two
 // INDEPENDENT Ed25519 attestors: machine facts and machine source rights.
 // SIGNING_JWK alone is only integrator integrity, NEVER a replacement.
 need(e.facts_rights_proof!==null&&typeof e.facts_rights_proof==='object'&&
   !Array.isArray(e.facts_rights_proof),'HOT50_FACTS_RIGHTS_PROOF_TYPE_INVALID');
 need(verifyCorroborationBinding(e),'HOT50_SOURCE_FACT_RIGHTS_BINDING_UNVERIFIED');
 need(verifyPinnedFactsOnlyGriV12Proof(e.facts_rights_proof),'HOT50_FACTS_AND_RIGHTS_ATTESTATION_UNVERIFIED');
 return e;
}
async function main(){
 const path=process.env.HOT50_EVENT_MANIFEST_PATH??'artifacts/hot50-risk-gate/verified-primary-events.json';
 need(existsSync(path),'HOT50_EVENT_MANIFEST_MISSING');
 const bytes=readFileSync(path);need(bytes.length>0&&bytes.length<2000000,'HOT50_EVENT_MANIFEST_OVERSIZED_OR_EMPTY');
 const doc=JSON.parse(bytes.toString('utf8'));
 need(doc.schema==='geomacro.hot50.primary-original-evidence.v1'&&Array.isArray(doc.events)&&
  doc.events.length===MAX_ITEMS,'HOT50_150_CELL_INPUT_MISSING');
 const now=Date.now(),expected=new Set(HOT50.flatMap(c=>CATEGORIES.map(k=>c+':'+k)));
 const cells=[];
 for(const raw of doc.events){
  const event=validateEvent(raw,now);
  const cell=event.country_iso3+':'+event.category;
  need(expected.delete(cell),'HOT50_CELL_DUPLICATE_OR_OUT_OF_SCOPE');
  const sourceReceipts=[];
  // Sequential bounded originals avoid a sudden burst against public sites.
  for(const source of event.publisher_sources)sourceReceipts.push(await checkOriginal(source,event,now));
  need(sourceReceipts.length>=3&&new Set(sourceReceipts.map(s=>s.publisher_org_id)).size>=3,
   'HOT50_THREE_ORIGINALS_UNVERIFIED');
  cells.push({country_iso3:event.country_iso3,category:event.category,event_fingerprint:event.event_fingerprint,
   factual_record_sha256:event.factual_record_sha256,
   original_primary_sources:sourceReceipts.length,
   independent_issuer_set_sha256:sha256(canonical(sourceReceipts.map(s=>s.publisher_org_id).sort())),
   source_hashes_sha256:sha256(canonical(sourceReceipts)),
   verified_dual_facts_rights_attestation:true,independent_native_fetch:true});
 }
 need(expected.size===0&&cells.length===150,'HOT50_NOT_ALL_CELLS_CERTIFIED');
 cells.sort((a,b)=>(a.country_iso3+':'+a.category).localeCompare(b.country_iso3+':'+b.category));
 const generated=new Date(),expires=new Date(generated.getTime()+3*3600000);
 const proof={schema:'geomacro.hot50.150cell-three-primary-issuer-attestation.v1',status:'PASS',
  generated_at:generated.toISOString(),expires_at:expires.toISOString(),nonce:randomUUID(),
  scope_countries:50,scope_categories:3,cells:150,three_independent_originals_per_cell:true,
  original_hashes_verified:true,existing_dual_fact_and_rights_signatures_verified:true,
  exact_150cell_manifest_sha256:sha256(canonical(cells)),cell_proofs:cells,
  signer_is_not_an_independent_news_source:true,
  external_human_reviewer_certification_not_inferred:true,no_funds:true};
 signedReport('artifacts/release/hot50-risk-gate-proof.json',proof);
 console.log(JSON.stringify({status:'PASS',countries:50,cells:cells.length,expires_at:proof.expires_at}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e),no_synthetic_news_or_attestation:true}));process.exitCode=2});
}