import {ORIGINAL_VERIFICATION_WINDOW_MS} from '../../src/lib/original-verification-policy.ts';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
// @ts-expect-error Existing bounded JavaScript auditor has no declaration file.
import {auditEveryDerivedNewsOriginal} from '../lib/all-news-original-evidence-audit.mjs';
// @ts-expect-error Existing byte/clock verifier has no declaration file.
import {verifyDerivedOriginalReferencePage} from '../lib/geomacro-original-page-readback.mjs';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client';
import {automatedInputId} from '../../src/lib/automated-intelligence-input';
import {loadRiskObjectVerificationKeysFromEnv} from '../../src/lib/risk-object-signing.server';
import {readPrivateSourceHandoffs} from './read-private-source-handoffs';
// @ts-expect-error Bounded JavaScript coverage monitor has no declaration file.
import {automaticNewsQualificationCoverage} from '../lib/automatic-news-qualification-coverage.mjs';
import {assertLowReviewTrust,lowSourceReviewBytes,verifyLowSourceReview,type LowReviewTrust,
 type LowSourceReview,type SignedLowSourceReview} from '../../src/lib/low-authority-source-review';

export function lowReviewerMaterial(env=process.env){
 // This process receives ONLY the dedicated low-review authority key, never the
 // issuer private key, rights key, B2 credentials or general D1 writer token.
 const key=createPrivateKey({key:Buffer.from(env.GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64??'','base64'),format:'der',type:'pkcs8'});
 if(key.asymmetricKeyType!=='ed25519')throw Error('LOW_REVIEW_KEY_INVALID');
 const der=createPublicKey(key).export({format:'der',type:'spki'}) as Buffer;
 const approved=createPublicKey(env.GEOMACRO_LOW_REVIEW_PUBLIC_PEM??'').export({format:'der',type:'spki'}) as Buffer;
 if(!der.equals(approved))throw Error('LOW_REVIEW_KEY_MISMATCH');
 const trust:LowReviewTrust={public_spki_b64:der.toString('base64'),
  public_sha256:env.GEOMACRO_LOW_REVIEW_PUBLIC_SHA256??'',
  issuer_public_keys_b64:JSON.parse(env.GEOMACRO_LOW_REVIEW_ISSUER_PUBLIC_KEYS_JSON??'[]')};
 return {key,trust};
}
export async function reviewDerivedInputs({signals,originalRefs,previousReviews=new Map(),env=process.env,now=new Date(),
 verifyOriginal=verifyDerivedOriginalReferencePage,persist=async(_items:SignedLowSourceReview[])=>{},
}:any){
 const {key,trust}=lowReviewerMaterial(env);await assertLowReviewTrust(trust);
 const dedup=new Map<string,any>();
 for(const signal of signals){
  const id=await automatedInputId(signal),prior=dedup.get(id);
  if(!prior||!originalRefs.has(prior.id)&&originalRefs.has(signal.id))dedup.set(id,signal);
 }
 signals=[...dedup.values()];
 const retainedSignals=signals;
 const reusedVerifiedIds=new Set<string>(),cooldownIds=new Set<string>(),reviewedIds=new Set<string>();
 const pending=[],trustedPrevious=new Map<string,SignedLowSourceReview>(),priorityById=new Map();
 let reusedVerified=0,cooldown=0;
 for(const signal of signals){
  const id=await automatedInputId(signal),prior=previousReviews.get(id);
  let valid=false;
  if(prior)try{
   await verifyLowSourceReview(prior,trust,now.getTime());
   valid=prior.review.input_id===id&&prior.review.category===signal.category&&
    prior.review.source_published_at===signal.published_at;
  }catch{/* Untrusted or expired prior state cannot suppress checking. */}
  if(valid)trustedPrevious.set(id,prior);
  if(valid&&prior.review.verdict==='SOURCE_EVIDENCE_VERIFIED'&&
   now.getTime()-Date.parse(signal.published_at)<=ORIGINAL_VERIFICATION_WINDOW_MS){reusedVerified++;reusedVerifiedIds.add(signal.id);continue;}
  if(valid&&prior.review.verdict==='SOURCE_EVIDENCE_REJECTED'&&
   now.getTime()-Date.parse(prior.review.reviewed_at)<30*60_000){cooldown++;cooldownIds.add(signal.id);continue;}
  pending.push(signal);
  // Signed first-queued time survives quota deferrals. Newly arriving
  // headlines cannot indefinitely overtake an older unattempted original.
  priorityById.set(signal.id,valid?Date.parse(prior.review.reviewed_at):now.getTime());
 }
 signals=pending;
 const evidence=new Map<string,string>();
 const proofKey=(o:any)=>JSON.stringify([o.category,o.original_article_url,o.original_published_at]);
 const audit=await auditEveryDerivedNewsOriginal({signals,originalRefs,now,maxReadbacks:6,maxPerCategory:4,priorityById,
  verify:async(args:any)=>{
   const proof=await verifyOriginal(args);
   if(proof?.accepted===true&&/^[a-f0-9]{64}$/.test(proof.original_article_sha256??''))
    evidence.set(proofKey(args.original),proof.original_article_sha256);
   return proof;
  }});
 const byId=new Map(signals.map((s:any)=>[s.id,s]));
 const unique=new Map<string,SignedLowSourceReview>();
 for(const row of audit.rows){
  reviewedIds.add(row.id);
  const signal:any=byId.get(row.id),ref=originalRefs.get(row.id);
  const verified=row.original_page_evidence_status==='ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED';
  const rejected=row.original_page_evidence_status==='ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED';
  const id=await automatedInputId(signal);
  const previous=trustedPrevious.get(id);
  // Do not reset the age of a still-unattempted queue item on every poll.
  // Its signed pending result remains the exact same non-authorizing bytes.
  if(!verified&&!rejected&&previous?.review.verdict==='EVIDENCE_PENDING'&&
     previous.review.reason===row.original_page_evidence_status){
   unique.set(id,previous);continue;
  }
  const review:LowSourceReview={schema:'geomacro.internal-low-source-review.v1',
   authority:'GEOMACRO_INTERNAL_AUTOMATED_LOW_V1',scope:'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME',
   input_id:id,category:signal.category,source_published_at:signal.published_at,
   reviewed_at:now.toISOString(),expires_at:new Date(Date.parse(signal.published_at)+72*3600_000).toISOString(),
   verdict:verified?'SOURCE_EVIDENCE_VERIFIED':rejected?'SOURCE_EVIDENCE_REJECTED':'EVIDENCE_PENDING',
   reason:row.original_page_evidence_status,
   evidence_sha256:verified?evidence.get(proofKey({category:signal.category,
    original_article_url:ref?.articleUrl,original_published_at:signal.published_at}))??null:null,
   semantic_claims_verified:false,commercial_authorization:false,external_reviewer_attested:false};
  const envelope={review,signature:sign(null,lowSourceReviewBytes(review),key).toString('base64')};
  await verifyLowSourceReview(envelope,trust,now.getTime());unique.set(id,envelope);
 }
 const items=[...unique.values()];
 const coverage=automaticNewsQualificationCoverage({
  retainedSignals,auditedRows:audit.rows,reusedVerifiedIds,cooldownIds,reviewedIds,
 });
 if(items.length!==reviewedIds.size||
    coverage.reviewed_or_pending_this_run!==audit.ingested_news_examined)
  throw Error('AUTOMATIC_NEWS_QUALIFICATION_COVERAGE_INCOMPLETE');
 for(let i=0;i<items.length;i+=40)await persist(items.slice(i,i+40));
 return {audit,reviewed_items:unique.size,reused_current_verified_items:reusedVerified,
  source_retry_cooldown_items:cooldown,source_verified_items:items.filter(e=>e.review.verdict==='SOURCE_EVIDENCE_VERIFIED').length,
  coverage};
}
export function safeLowAuthorityReviewFailure(error:unknown){
 const message=error instanceof Error?error.message:'';
 return /^[A-Z0-9_]{1,100}$/u.test(message)
  ?message:'LOW_AUTHORITY_REVIEW_UNCLASSIFIED_FAILURE';
}
if(import.meta.main){
 try{
  const now=new Date(),{trust}=lowReviewerMaterial();await assertLowReviewTrust(trust);
  const retained=await readPrivateSourceHandoffs({keys:loadRiskObjectVerificationKeysFromEnv(),trust,now});
  const signals=await fetchAllDerivedNews(fetch,now.getTime());
  const originalRefs=new Map();
  for(const signal of signals){const ref=retained.originals.get(await automatedInputId(signal));if(ref)originalRefs.set(signal.id,ref);}
  const result=await reviewDerivedInputs({signals,originalRefs,previousReviews:retained.previous,now,
   persist:async(items:SignedLowSourceReview[])=>{
    const r=await fetch('https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/low-source-reviews',{
     method:'PUT',redirect:'error',headers:{Authorization:'Bearer '+process.env.GEOMACRO_LOW_REVIEW_TOKEN,
      'Content-Type':'application/json'},body:JSON.stringify({items}),signal:AbortSignal.timeout(15000)});
    if(r.status!==200)throw Error('PERSIST');
    const ack=await r.json();if(ack.ok!==true||ack.accepted!==items.length)throw Error('ACK');
   }});
  // IPC only. The parent must not upload this internal source-review result.
  process.stdout.write(JSON.stringify(result));
 }catch(error){
  const reason=safeLowAuthorityReviewFailure(error);
  process.stderr.write('LOW_AUTHORITY_SOURCE_REVIEW_UNVERIFIED:'+reason+'\n');
  process.exitCode=2;
 }
}
