import {verifyPrivateSourceHandoff} from '../../src/lib/private-source-handoff.ts';
import {verifyLowSourceReview,type LowReviewTrust,type SignedLowSourceReview} from '../../src/lib/low-authority-source-review.ts';
import {automatedInputId,type AutomatedInputEnvelope} from '../../src/lib/automated-intelligence-input.ts';
import type {StatelessSourceCandidate} from '../../src/lib/stateless-intelligence-model.ts';
export async function readPrivateSourceHandoffs({env=process.env,keys,trust,now=new Date(),fetchImpl=fetch}:{
 env?:NodeJS.ProcessEnv;keys:Parameters<typeof verifyPrivateSourceHandoff>[2];trust:LowReviewTrust;now?:Date;fetchImpl?:typeof fetch;
}){
 const token=env.GEOMACRO_LOW_REVIEW_TOKEN??'';
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('PRIVATE_HANDOFF_READER_CONFIG_REQUIRED');
 const originals=new Map<string,StatelessSourceCandidate>(),previous=new Map<string,SignedLowSourceReview>();
 let offset=0;
 for(let page=0;page<100;page++){
  const response=await fetchImpl('https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/source-handoffs?offset='+offset,
   {redirect:'error',cache:'no-store',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!response.ok||response.redirected)throw Error('PRIVATE_HANDOFF_READ_FAILED');
  const raw=await response.text();if(raw.length>300000)throw Error('PRIVATE_HANDOFF_READ_OVERSIZE');
  const doc=JSON.parse(raw);
  if(doc.ok!==true||doc.schema!=='geomacro.private-source-handoff-feed.v1'||doc.offset!==offset||
   !Array.isArray(doc.items)||doc.items.length>40||
   !(doc.next_offset===null||doc.items.length>0&&doc.next_offset===offset+doc.items.length&&doc.next_offset<600))
   throw Error('PRIVATE_HANDOFF_FEED_INVALID');
  for(const row of doc.items as {input:AutomatedInputEnvelope;ref:StatelessSourceCandidate;previous_review:SignedLowSourceReview|null}[]){
   const input_id=await automatedInputId(row.input.payload.signal);
   await verifyPrivateSourceHandoff({input_id,ref:row.ref},row.input,keys,now.getTime());
   if(originals.has(input_id))throw Error('PRIVATE_HANDOFF_DUPLICATE_INPUT');
   originals.set(input_id,row.ref);
   const review=row.previous_review;
   if(review){
    try{
     await verifyLowSourceReview(review,trust,now.getTime());
     if(review.review.input_id===input_id&&review.review.category===row.ref.category&&
      review.review.source_published_at===row.ref.publishedAt)previous.set(input_id,review);
    }catch{/* Expired or invalid evidence never suppresses a real new source check. */}
   }
  }
  if(doc.next_offset===null)return {originals,previous};
  offset=doc.next_offset;
 }
 throw Error('PRIVATE_HANDOFF_PAGE_BOUND_EXCEEDED');
}
