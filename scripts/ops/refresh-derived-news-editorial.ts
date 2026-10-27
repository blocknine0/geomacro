#!/usr/bin/env bun
// Re-render retained Geomacro-owned cards from their existing protected source
// references. No raw reference or publisher headline is printed or published.
import {createHmac,createPublicKey} from 'node:crypto';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client';
import {automatedInputId} from '../../src/lib/automated-intelligence-input';
import {deriveStatelessSignals} from '../../src/lib/stateless-intelligence-model';
import {loadRiskObjectVerificationKeysFromEnv} from '../../src/lib/risk-object-signing.server';
import {readPrivateSourceHandoffs} from './read-private-source-handoffs';
import {prepareDerivedNewsBatches} from '../lib/derived-news-d1-batches.mjs';

export function refreshRetainedSignal(signal:Parameters<typeof automatedInputId>[0],
 ref:Parameters<typeof deriveStatelessSignals>[0][number],now:number){
 const derived=deriveStatelessSignals([ref],now)[0];
 // Equivalent UI aliases share authenticated content identity; retain each ID.
 const next=derived?{...derived,id:signal.id}:null;
 if(!next||next.category!==signal.category||next.published_at!==signal.published_at||
  next.date_precision!==signal.date_precision)throw Error('CLOCK');
 return next;
}

if(import.meta.main){
 try{
  const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').trim();
  if(root.length<32||process.env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||process.env.GITHUB_REF!=='refs/heads/main')
   throw Error('CONFIG');
  const admin=createHmac('sha256',root).update('geomacro-control-plane-v1').digest('hex');
  const capability=createHmac('sha256',admin).update('geomacro-low-source-review-v1').digest('hex');
  const keys=loadRiskObjectVerificationKeysFromEnv();
  const trust={public_spki_b64:createPublicKey(process.env.GEOMACRO_LOW_REVIEW_PUBLIC_PEM??'')
   .export({format:'der',type:'spki'}).toString('base64'),
   public_sha256:process.env.GEOMACRO_LOW_REVIEW_PUBLIC_SHA256??'',
   issuer_public_keys_b64:Object.values(keys).map((v:any)=>typeof v==='string'?v:v.public_key_spki_b64)};
  const now=new Date();
  const retained=await readPrivateSourceHandoffs({keys,trust,now,
   env:{...process.env,GEOMACRO_LOW_REVIEW_TOKEN:capability}});
  const journal=await fetchAllDerivedNews(fetch,now.getTime()),revised=[];
  let missing=0;
  for(const signal of journal){
   const ref=retained.originals.get(await automatedInputId(signal));
   if(!ref){missing++;continue;}
   const next=refreshRetainedSignal(signal,ref,now.getTime());
   if(await automatedInputId(next)!==await automatedInputId(signal))revised.push(next);
  }
  const {chunks}=prepareDerivedNewsBatches(revised);
  for(const signals of chunks){
   if(!signals.length)continue;
   const response=await fetch('https://geomacro-control-plane.daspallab202391.workers.dev/v1/website-derived-news',{
    method:'PUT',redirect:'error',headers:{Authorization:'Bearer '+admin,'Content-Type':'application/json'},
    body:JSON.stringify({schema:'geomacro.website-derived-news-batch.v1',signals}),signal:AbortSignal.timeout(15000)});
   const ack=await response.json();
   if(response.status!==200||response.redirected||ack.ok!==true||ack.accepted!==signals.length)throw Error('ACK');
  }
  if(revised.length){
   const after=new Map((await fetchAllDerivedNews(fetch,Date.now())).map(s=>[s.id,s]));
   for(const signal of revised){
    const actual=after.get(signal.id);
    if(!actual||await automatedInputId(actual)!==await automatedInputId(signal))throw Error('READBACK');
   }
  }
  console.log(JSON.stringify({schema:'geomacro.actor-action-editorial-refresh.v1',
   retained_news:journal.length,derived_rows_refreshed:revised.length,
   rows_without_matching_private_reference:missing,original_dates_rewritten:false,
   first_ingest_times_rewritten:false,raw_references_exposed:false,
   resigning_required:revised.length>0,commercial_qualification_changed:false,payments:0}));
 }catch{console.error('DERIVED_NEWS_EDITORIAL_REFRESH_NOT_VERIFIED');process.exitCode=2;}
}
