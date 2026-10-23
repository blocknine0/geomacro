// Publish only source-private, derived website cards through the existing journal.
import {createHmac} from 'node:crypto';
import {checkedDerivedNews} from '../../src/lib/public-derived-news-client.ts';
import {prepareDerivedNewsBatches} from './derived-news-d1-batches.mjs';
const URL='https://geomacro-control-plane.daspallab202391.workers.dev/v1/website-derived-news';
const doc=signals=>({ok:true,schema:'geomacro.website-derived-news-feed.v1',
 original_release_delay_minutes:15,retention_days:3,retention_hours:72,delivery_scope:'free_website_only',signals});
const releaseAt=s=>Date.parse(s.published_at)+15*60000;
const sameClock=(a,b)=>a.category===b.category&&a.published_at===b.published_at&&a.date_precision===b.date_precision;
export async function createContinentNewsPublisher({root,readJournal,fetchImpl=fetch,
 now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(typeof root!=='string'||root.trim().length<32)throw Error('CONTINENT_NEWS_AUTH_MISSING');
 const authorization='Bearer '+createHmac('sha256',root.trim()).update('geomacro-control-plane-v1').digest('hex');
 const baseline=await readJournal(fetchImpl,now());
 const known=new Map(baseline.map(s=>[s.id,s])),pending=new Map();
 let writes=0,duplicates=0,verified=0;
 const byCategory={geopolitics:0,macro:0,rare_earth:0};
 async function publishReady(){
  const ready=[...pending.values()].filter(s=>releaseAt(s)<=now());
  for(const batch of prepareDerivedNewsBatches(ready).chunks){
   if(!batch.length)continue;
   if(checkedDerivedNews(doc(batch),now()).length!==batch.length)throw Error('CONTINENT_NEWS_PUBLIC_GATE_FAILED');
   const response=await fetchImpl(URL,{method:'PUT',redirect:'error',cache:'no-store',
    headers:{authorization,'Content-Type':'application/json'},
    body:JSON.stringify({schema:'geomacro.website-derived-news-batch.v1',signals:batch}),
    signal:AbortSignal.timeout(12000)});
   if(!response.ok||response.redirected)throw Error('CONTINENT_NEWS_D1_WRITE_FAILED');
   const raw=await response.text();if(raw.length>10000)throw Error('CONTINENT_NEWS_ACK_OVERSIZE');
   const ack=JSON.parse(raw);
   if(ack.ok!==true||ack.schema!=='geomacro.website-derived-news-write-receipt.v1'||ack.accepted!==batch.length)
    throw Error('CONTINENT_NEWS_ACK_INVALID');
   const readback=await readJournal(fetchImpl,now());
   for(const signal of batch){
    if(!readback.some(s=>s.id===signal.id&&sameClock(s,signal)&&
     Object.keys(signal).every(k=>JSON.stringify(s[k])===JSON.stringify(signal[k]))))
     throw Error('CONTINENT_NEWS_READBACK_MISSING');
   }
   for(const signal of batch){pending.delete(signal.id);known.set(signal.id,signal);byCategory[signal.category]++;}
   writes+=batch.length;verified+=batch.length;
  }
 }
 // Serialize the two country workers' D1 operations; retain identity across countries.
 let chain=Promise.resolve();
 function enqueue(task){const next=chain.then(task);chain=next.catch(()=>{});return next;}
 return {
  accept:signals=>enqueue(async()=>{
   if(!Array.isArray(signals)||signals.length>20)throw Error('CONTINENT_NEWS_COUNTRY_BATCH_INVALID');
   for(const signal of signals){
    const at=Date.parse(signal?.published_at),clock=now();
    // All bridge outputs are exact page-native clocks. Validate pending shape
    // at release time, but never write it before the real current clock permits.
    if(typeof signal?.id!=='string'||!signal.id.startsWith(signal.category+'-')||signal.date_precision!=='exact'||signal.status!=='official_release_observed_unscored'||
       !Number.isFinite(at)||at>clock||at<clock-86400000||
       checkedDerivedNews(doc([signal]),Math.max(clock,releaseAt(signal))).length!==1)
     throw Error('CONTINENT_NEWS_COUNTRY_SIGNAL_INVALID');
    const previous=known.get(signal.id)??pending.get(signal.id);
    if(previous){
     if(!sameClock(previous,signal))throw Error('CONTINENT_NEWS_IMMUTABLE_CLOCK_CONFLICT');
     duplicates++;continue;
    }
    pending.set(signal.id,signal);
   }
   await publishReady();
  }),
  finish:()=>enqueue(async()=>{
   // No source re-fetch. Hold only already derived rows for at most 15m.
   const deadline=now()+15*60000+1000;
   while(pending.size){
    await publishReady();if(!pending.size)break;
    const delay=Math.min(...[...pending.values()].map(releaseAt))-now();
    if(delay<0||now()+delay>deadline)throw Error('CONTINENT_NEWS_DELAY_BOUND_EXCEEDED');
    await wait(Math.min(Math.max(delay,1),30000));
   }
   return {schema:'geomacro.continent-news-publication.v1',new_rows_written:writes,
    new_rows_readback_verified:verified,new_rows_by_category:{...byCategory},duplicate_rows_excluded:duplicates,pending_rows:pending.size,
    public_delay_minutes:15,count_basis:"ABSENT_FROM_THIS_RUN_INITIAL_JOURNAL",
    exact_first_writer_attribution_verified:false,signed_commercial_products_claimed:false,payments:0,b2_requests:0,supabase_requests:0};
  }),
 };
}
