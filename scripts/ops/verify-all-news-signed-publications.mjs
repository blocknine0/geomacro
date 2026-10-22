#!/usr/bin/env node
import {ORIGINAL_VERIFICATION_WINDOW_MS,ORIGINAL_VERIFICATION_WINDOW_HOURS} from '../../src/lib/original-verification-policy.ts';
import {resolve} from 'node:path';
import {safeSignedNewsFailureReceipt} from '../lib/signed-news-safe-diagnostic.mjs';
import {pathToFileURL} from 'node:url';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client.ts';
import {automatedInputId,verifyAutomatedInput} from '../../src/lib/automated-intelligence-input.ts';
const URL='https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/intelligence-publications';
export function publicationVerificationKeys(env=process.env){
 const keys=JSON.parse(env.RISK_OBJECT_VERIFY_KEYS_JSON||'{}');
 const id=env.RISK_OBJECT_SIGNING_KEY_ID,pub=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
 if(id&&pub){
  const old=keys[id];
  if(old&&(typeof old==='string'?old:old.public_key_spki_b64)!==pub)throw Error('SIGNED_NEWS_KEY_CONFLICT');
  if(!old)keys[id]={public_key_spki_b64:pub,status:'active',
   not_before:env.RISK_OBJECT_SIGNING_KEY_NOT_BEFORE||null,not_after:env.RISK_OBJECT_SIGNING_KEY_NOT_AFTER||null};
 }
 if(!keys||typeof keys!=='object'||Array.isArray(keys)||!Object.keys(keys).length)throw Error('SIGNED_NEWS_REGISTERED_KEYS_REQUIRED');
 return keys;
}
export async function verifyAllNewsSignedPublications({fetchImpl=fetch,keys=publicationVerificationKeys(),now=Date.now(),readJournal=fetchAllDerivedNews}={}){
 const journal=await readJournal(fetchImpl,now),expected=new Set();
 for(const signal of journal)expected.add(await automatedInputId(signal));
 if(expected.size===0||expected.size>600)throw Error('SIGNED_NEWS_NO_RETAINED_INPUT');
 const seen=new Set();let signed=0,original=0,current=0,currentEligible=0;
 for(let offset=0;offset<600;offset+=40){
  const response=await fetchImpl(URL+'?offset='+offset,{method:'GET',redirect:'error',cache:'no-store',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(response.status!==200||response.redirected)throw Error('SIGNED_NEWS_HTTP_UNAVAILABLE');
  const text=await response.text();if(text.length>500000)throw Error('SIGNED_NEWS_RESPONSE_OVERSIZE');
  const page=JSON.parse(text);
  if(page.ok!==true||page.schema!=='geomacro.public-signed-derived-news.v1'||
   page.profile!=='GEOMACRO_AUTOMATED_DERIVED_INPUT_V1'||page.page_offset!==offset||page.page_size!==40||
   page.unique_items!==expected.size||!Array.isArray(page.items)||page.items.length<1||page.items.length>40||
   page.legacy_signed_hot_product_equivalent!==false||page.commercial_rights_attested!==false||
   page.scored!==false||page.chargeable!==false)throw Error('SIGNED_NEWS_PAGE_CONTRACT');
  for(const item of page.items){
   const id=await automatedInputId(item.signal);
   if(id!==item.input_id||!expected.has(id)||seen.has(id))throw Error('SIGNED_NEWS_IDENTITY_OR_COVERAGE');
   seen.add(id);
   if(item.signature_verified!==true||!item.proof)throw Error('SIGNED_NEWS_ITEM_NOT_SIGNED');
   await verifyAutomatedInput(item.proof,keys,now);
   if(await automatedInputId(item.proof.payload.signal)!==id)throw Error('SIGNED_NEWS_PROOF_BINDING');
   const age=now-Date.parse(item.signal.published_at);
   const isCurrent=item.signal.date_precision==='exact'&&age>=15*60_000&&age<=60*60_000;
   const qualified=item.signal.status==='official_release_observed_unscored';
   if(item.original_published_at!==item.signal.published_at||
    item.source_current_under_60_minutes!==isCurrent||item.qualified_topic_release!==qualified||
    typeof item.original_page_verified!=='boolean'||
    item.current_source_verified_signed!==(isCurrent&&qualified&&item.original_page_verified)||
    item.commercial_rights_attested!==false||item.independent_reviewed!==false||item.scored!==false||item.chargeable!==false)
    throw Error('SIGNED_NEWS_AUTHORITY_OR_CLOCK');
   if(item.original_page_verified){
    const at=Date.parse(item.source_reviewed_at??'');
    if(item.source_status!=='ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED'||
       !Number.isFinite(at)||at>now||now-at>ORIGINAL_VERIFICATION_WINDOW_MS||age>ORIGINAL_VERIFICATION_WINDOW_MS)throw Error('SIGNED_NEWS_SOURCE_STATUS');
    original++;
   }
   signed++;if(isCurrent&&qualified)currentEligible++;
   if(item.current_source_verified_signed)current++;
  }
  if(page.next_offset===null){
   if(seen.size!==expected.size)throw Error('SIGNED_NEWS_INCOMPLETE_COVERAGE');
   return {schema:'geomacro.all-news-signed-publication-acceptance.v1',journal_items:journal.length,
    unique_items:expected.size,original_verification_window_hours:ORIGINAL_VERIFICATION_WINDOW_HOURS,exact_signed_inputs_independently_verified:signed,
    all_retained_unique_news_signature_verified:true,original_page_verified_reported:original,
    current_qualified_news:currentEligible,current_source_verified_signed_reported:current,
    all_current_qualified_news_source_verified_signed:currentEligible>0&&current===currentEligible,
    legacy_signed_hot_3_of_3_verified:false,commercial_rights_attested:false,
    paid_delivery_enabled:false,payments:0};
  }
  if(page.items.length!==40||page.next_offset!==offset+40)throw Error('SIGNED_NEWS_CURSOR');
 }
 throw Error('SIGNED_NEWS_PAGE_LIMIT');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await verifyAllNewsSignedPublications()));}
 catch(error){console.error(JSON.stringify(safeSignedNewsFailureReceipt(error)));process.exitCode=2;}
}
