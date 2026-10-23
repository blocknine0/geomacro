import {checkedDerivedNews} from './public-derived-news-client';
import type {StatelessIntelligenceResult} from './stateless-public-intelligence.server';
import type {StatelessCategory,StatelessIntelligenceSignal} from './stateless-intelligence-model';
const CATEGORIES=['geopolitics','macro','rare_earth'] as const;
const DAY=86400000;
type RetainedClock=Pick<StatelessIntelligenceSignal,'id'|'category'|'published_at'|'date_precision'>;
export type BackfillPublisher={accept:(signals:StatelessIntelligenceSignal[])=>Promise<void>;finish:()=>Promise<Record<string,unknown>>};
/** Reuse broad existing official readers, not the fastlane's newest-20 cap.
 * Original publication time controls the rolling window. Nothing is re-dated.
 */
export async function backfillLast24HourNews({readCategory,publisher,retainedClocks=[],now=Date.now()}:{
 readCategory:(category:StatelessCategory)=>Promise<StatelessIntelligenceResult>;
 publisher:BackfillPublisher;retainedClocks?:readonly RetainedClock[];now?:number;
}){
 if(!Number.isFinite(now))throw Error('LAST_24H_NEWS_CLOCK_INVALID');
 const results=await Promise.allSettled(CATEGORIES.map(readCategory));
 const categories=[];
 const retained=new Map(retainedClocks.map(s=>[s.id,s]));
 for(let index=0;index<CATEGORIES.length;index++){
  const category=CATEGORIES[index],result=results[index];
  let examined=0,eligibleCount=0,retainedClockVariants=0;
  try{
   if(result.status!=='fulfilled')throw Error('LAST_24H_SOURCE_UNAVAILABLE');
   const report=result.value;
   if(report.category!==category||!Number.isSafeInteger(report.feed_count)||report.feed_count<1||
      !Number.isSafeInteger(report.healthy_feed_count)||report.healthy_feed_count<1||report.healthy_feed_count>report.feed_count||
      !Array.isArray(report.signals)||report.signals.length>200||
      report.signals.some(s=>s.category!==category))throw Error('LAST_24H_SOURCE_CONTRACT_INVALID');
   examined=report.signals.length;
   const eligible=report.signals.filter(signal=>{
    const at=Date.parse(signal.published_at);
    return signal.status==='official_release_observed_unscored'&&
     signal.date_precision==='exact'&&Number.isFinite(at)&&at>=now-DAY&&at<=now;
   });
   const safe=checkedDerivedNews({ok:true,schema:'geomacro.website-derived-news-feed.v1',
    original_release_delay_minutes:0,retention_days:3,retention_hours:72,
    delivery_scope:'free_website_only',signals:eligible},now);
   if(safe.length!==eligible.length)throw Error('LAST_24H_DERIVED_SHAPE_INVALID');
   eligibleCount=safe.length;
   // If the SAME retained finding already satisfies this window, keep its
   // immutable stored native clock. A different feed/page representation is
   // not a new story and must not overwrite the canonical journal clock.
   const publishable=safe.filter(signal=>{
    const previous=retained.get(signal.id);
    if(!previous||previous.published_at===signal.published_at)return true;
    const at=Date.parse(previous.published_at);
    if(previous.category!==category||previous.date_precision!==signal.date_precision||
       !Number.isFinite(at)||at<now-DAY||at>now)
     throw Error('LAST_24H_RETAINED_CLOCK_OUTSIDE_WINDOW');
    retainedClockVariants++;return false;
   });
   // The existing publisher handles retained-history/cross-country dedup,
   // immutable clocks, bounded D1 chunks and independent journal readback.
   for(let offset=0;offset<publishable.length;offset+=20)await publisher.accept(publishable.slice(offset,offset+20));
   categories.push({category,status:'LAST_24H_BACKFILL_COMPLETED',
    findings_examined:examined,eligible_original_last_24h:eligibleCount,
    existing_clock_variants_retained:retainedClockVariants,
    source_readers_configured:report.feed_count,source_readers_healthy:report.healthy_feed_count});
  }catch(error){
   const reason=error instanceof Error&&/^(?:LAST_24H_|CONTINENT_NEWS_)[A-Z0-9_]+$/u.test(error.message)
    ?error.message:'LAST_24H_SOURCE_OR_PUBLICATION_UNAVAILABLE';
   categories.push({category,status:'LAST_24H_BACKFILL_UNAVAILABLE',
    findings_examined:examined,eligible_original_last_24h:eligibleCount,
    failure_reason:reason});
  }
 }
 const publication=await publisher.finish();
 return {schema:'geomacro.last-24-hour-news-backfill.v1',checked_at:new Date(now).toISOString(),
  window_start_original_utc:new Date(now-DAY).toISOString(),
  public_cutoff_original_utc:new Date(now).toISOString(),
  original_lookback_hours:24,public_delay_minutes:0,retention_hours:72,
  source_reader_cap_per_category:200,world_news_coverage_exhaustive:false,
  categories,complete:categories.every(c=>c.status==='LAST_24H_BACKFILL_COMPLETED'),publication,
  original_dates_rewritten:false,raw_source_data_persisted:false,
  payments:0,b2_requests:0,supabase_requests:0};
}
