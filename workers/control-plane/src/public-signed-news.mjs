import {ORIGINAL_VERIFICATION_WINDOW_HOURS} from '../../../src/lib/original-verification-policy.ts';
// Public proofs for the SAME derived-only newsroom rows. Existing issuer
// signatures remain ingestion proofs; original-page review is a separate
// narrow authority. Neither is silently upgraded to the legacy GRO/GRI proof.
import {readDerivedStoriesBundle} from './website-derived-intelligence.mjs';
import {checkedDerivedNews} from '../../../src/lib/public-derived-news-client.ts';
import {automatedInputContent,automatedInputId,inputHash,verifyAutomatedInput} from '../../../src/lib/automated-intelligence-input.ts';
import {verifyLowSourceReview} from '../../../src/lib/low-authority-source-review.ts';
const SIZE=40;
const reply=(body,status=200)=>Response.json(body,{status,headers:{
 'Cache-Control':'no-store','Access-Control-Allow-Origin':'*',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
}});
const counts=items=>({total:items.length,
 signatures_verified:items.filter(x=>x.signature_verified).length,
 original_pages_verified:items.filter(x=>x.original_page_verified).length,
 current_source_verified_signed:items.filter(x=>x.current_source_verified_signed).length,
 pending_signature:items.filter(x=>!x.signature_verified).length,
});
export async function publicSignedNews(env,query=new URLSearchParams(),now=Date.now(),{readBundle=readDerivedStoriesBundle}={}){
 const raw=query.get('offset')??'0',offset=Number(raw);
 if([...query.keys()].some(k=>k!=='offset')||query.getAll('offset').length>1||
    !/^(?:0|[1-9][0-9]{0,2})$/.test(raw)||offset%SIZE||offset>=600)
  return reply({ok:false,error:'SIGNED_NEWS_QUERY_INVALID'},400);
 if(!env?.DB||!Number.isFinite(now))return reply({ok:false,error:'SIGNED_NEWS_UNAVAILABLE'},503);
 try{
  // Every proof page still reads canonical D1 and verifies fresh signatures.
  // A complete <=600-row bundle avoids repeating three OFFSET scans of the
  // same journal for every 40-item signed page. No cached proof is accepted.
  const response=await readBundle(env,now,false);
  if(response.status!==200)throw Error('JOURNAL');
  const bundle=await response.json();
  if(bundle.ok!==true||bundle.schema!=='geomacro.website-derived-news-bundle.v1'||
     bundle.complete!==true||bundle.item_cap!==600||
     bundle.original_release_delay_minutes!==0||bundle.retention_hours!==72||
     bundle.retention_days!==3||bundle.delivery_scope!=='free_website_only'||
     !Array.isArray(bundle.signals)||bundle.signals.length>600||
     bundle.returned_rows!==bundle.signals.length)throw Error('JOURNAL');
  const journal=[],seen=new Set();
  // Reuse the original strict signal validator in bounded in-memory chunks.
  // No per-chunk D1 reads or rolling-deployment fallback.
  for(let start=0;start<bundle.signals.length;start+=250){
   const page={...bundle,schema:'geomacro.website-derived-news-feed.v1',
    signals:bundle.signals.slice(start,start+250)};
   for(const signal of checkedDerivedNews(page,now)){
    if(seen.has(signal.id))throw Error('DUPLICATE');
    seen.add(signal.id);journal.push(signal);
   }
  }
  // One exact canonical identity per unique derived item, including revisions.
  // Alternate journal IDs are aliases, never duplicate signed publications.
  const unique=new Map();
  for(const signal of journal){
   const content=automatedInputContent(signal);
   if(!unique.has(content))unique.set(content,signal);
  }
  // Deduplicate exact canonical bytes without 600 WebCrypto operations on
  // every proof page. Only the selected 40 items need canonical hash IDs.
  // One content fingerprint binds every page to the same journal version.
  // This prevents newly ingested/revised D1 rows between 40-item requests
  // from being mistaken for missing or invalid signatures.
  const journalFingerprint=await inputHash(JSON.stringify([...unique.keys()]));
  const selected=await Promise.all([...unique.values()].slice(offset,offset+SIZE)
   .map(async signal=>[await automatedInputId(signal),signal]));
  const keys=JSON.parse(env.AUTOMATED_FINDS_VERIFY_KEYS_JSON??'{}');
  const trust={public_spki_b64:env.GEOMACRO_LOW_REVIEW_PUBLIC_SPKI_B64,
   public_sha256:env.GEOMACRO_LOW_REVIEW_PUBLIC_SHA256,
   issuer_public_keys_b64:Object.values(keys).map(x=>typeof x==='string'?x:x.public_key_spki_b64)};
  const states=new Map();
  if(selected.length){
   const ids=selected.flatMap(([id])=>['automated_input_v1:'+id,'low_source_review_v1:'+id]);
   const result=await env.DB.prepare('SELECT key,value_json FROM control_state WHERE key IN ('+ids.map(()=>'?').join(',')+')')
    .bind(...ids).all();
   if(result.success===false||!Array.isArray(result.results)||result.results.length>ids.length)throw Error('STATE');
   for(const row of result.results){if(!ids.includes(row.key)||states.has(row.key))throw Error('STATE');states.set(row.key,row.value_json);}
  }
  const items=[];
  for(const [id,signal] of selected){
   let proof=null,verification_key=null,sourceReview=null,signature_verified=false;
   let signature_status='SIGNATURE_NOT_YET_PUBLISHED',source_status='SOURCE_REVIEW_PENDING';
   try{
    const saved=states.get('automated_input_v1:'+id);
    if(saved){
     const envelope=JSON.parse(saved);await verifyAutomatedInput(envelope,keys,now);
     if(await automatedInputId(envelope.payload.signal)!==id)throw Error('BINDING');
     proof=envelope;
     const registered=keys[envelope.integrity.signing_key_id];
     // Never reflect arbitrary configuration properties from a key registry.
     verification_key={public_key_spki_b64:typeof registered==='string'?registered:registered.public_key_spki_b64,
      status:typeof registered==='string'?'active':registered.status??'active',
      not_before:typeof registered==='string'?null:registered.not_before??null,
      not_after:typeof registered==='string'?null:registered.not_after??null};
     signature_verified=true;
     signature_status='EXACT_DERIVED_INPUT_ED25519_VERIFIED';
    }
   }catch{signature_status='SIGNATURE_OR_CONTENT_NOT_VERIFIED';}
   if(signature_verified){
    try{
     const saved=states.get('low_source_review_v1:'+id);
     if(saved){
      const envelope=JSON.parse(saved);await verifyLowSourceReview(envelope,trust,now);
      const r=envelope.review;
      if(r.input_id!==id||r.category!==signal.category||r.source_published_at!==signal.published_at)throw Error('BINDING');
      sourceReview=r;source_status=r.verdict==='SOURCE_EVIDENCE_VERIFIED'?'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED':r.reason;
     }
    }catch{source_status='SOURCE_REVIEW_NOT_VERIFIED';}
   }
   const original_page_verified=sourceReview?.verdict==='SOURCE_EVIDENCE_VERIFIED';
   const sourceAge=now-Date.parse(signal.published_at);
   const current=signal.date_precision==='exact'&&sourceAge>=0&&sourceAge<=60*60_000;
   const qualified=signal.status==='official_release_observed_unscored';
   const current_source_verified_signed=signature_verified&&original_page_verified&&current&&qualified;
   items.push({input_id:id,signal,signature_verified,signature_status,proof,verification_key,
    original_published_at:signal.published_at,source_age_minutes:Math.floor(sourceAge/60_000),
    original_page_verified,source_status,source_reviewed_at:sourceReview?.reviewed_at??null,
    source_current_under_60_minutes:current,qualified_topic_release:qualified,current_source_verified_signed,
    publication_state:current_source_verified_signed?'CURRENT_SOURCE_VERIFIED_SIGNED_DERIVED_INPUT':
     !signature_verified?'PENDING_VALID_SIGNATURE':!current?'SIGNED_DATED_RETAINED_INPUT':
     !qualified?'SIGNED_UNCLASSIFIED_CANDIDATE':'SIGNED_INPUT_AWAITING_ORIGINAL_PAGE_VERIFICATION',
    independent_reviewed:false,commercial_rights_attested:false,scored:false,chargeable:false});
  }
  return reply({ok:true,schema:'geomacro.public-signed-derived-news.v1',
   profile:'GEOMACRO_AUTOMATED_DERIVED_INPUT_V1',journal_origin:'SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE',
   checked_at:new Date(now).toISOString(),journal_rows:journal.length,unique_items:unique.size,
   journal_fingerprint:journalFingerprint,
   duplicate_aliases_excluded:journal.length-unique.size,page_offset:offset,page_size:SIZE,
   next_offset:offset+SIZE<unique.size?offset+SIZE:null,page_counts:counts(items),items,
   retention_hours:72,original_release_delay_minutes:0,original_verification_window_hours:ORIGINAL_VERIFICATION_WINDOW_HOURS,
   signature_scope:'GEOMACRO_ISSUANCE_AND_EXACT_DERIVED_INPUT_BYTES',
   source_review_scope:'ORIGINAL_PAGE_BYTES_AND_NATIVE_PUBLICATION_TIME',
   legacy_signed_hot_product_equivalent:false,independent_reviewed:false,
   commercial_rights_attested:false,scored:false,chargeable:false,
   private_original_references_disclosed:false,payments:0});
 }catch{return reply({ok:false,error:'SIGNED_NEWS_READBACK_UNVERIFIED'},503);}
}
