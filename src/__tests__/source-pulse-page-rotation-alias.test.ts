import {describe,expect,it} from 'vitest';
import {probe30MinThreeDomainPulse,THIRTY_MIN_PUBLISHER_PAIRS,select30MinPublishers,sourcePulsePageRotationSlot} from '../../scripts/ops/probe-30min-three-domain-pulse.mjs';
import {probeExpandedSource,selectRotatingFirstPartyPages,EXPANDED_OFFICIAL_SOURCES} from '../../scripts/ops/probe-expanded-official-source-mesh.mjs';

// Production polls each publisher only in two of four half-hour slots. A
// global slot*2 modulo 16 permanently misses half its article pages.
const start=Date.parse('2026-10-15T00:00:00.000Z');
const urls=Array.from({length:16},(_,i)=>
 'https://www.gov.uk/government/news/treasury-original-announcement-'+i);
const feed='<feed>'+urls.map(url=>'<entry><title>Treasury original economic announcement</title>'+
 '<updated>2026-10-15T00:00:00Z</updated><link rel="alternate" href="'+url+'"/></entry>').join('')+'</feed>';
const observed=(source:{id:string,domain:string})=>({
 source_id:source.id,domain:source.domain,publisher_reachable:true,format_valid:true,
 original_publisher_topical_30m:0,original_publisher_topical_90m:0,original_publisher_topical_6h:0,
});

describe('publisher/page rotation composition',()=>{
 it('covers bounded stable pools for every selected issuer across composed scheduling cycles',()=>{
  for(const [domain,ids] of Object.entries(THIRTY_MIN_PUBLISHER_PAIRS)){
   for(const id of ids as string[]){
    for(const length of [3,16,19,20,79,80]){
     const pool=Array.from({length},(_,i)=>'https://www.gov.uk/government/news/original-article-'+i);
     const seen=new Set<string>();let prior:number|null=null,visits=0;
     // At least length consecutive issuer opportunities, including wraps.
     for(let offset=0;offset<length*ids.length;offset++){
      const now=new Date(start+offset*30*60000);
      if(!select30MinPublishers(now)[domain].some((s:any)=>s.id===id))continue;
      const rotationSlot=sourcePulsePageRotationSlot(domain,id,now);
      if(prior!==null)expect(rotationSlot).toBe(prior+1);
      prior=rotationSlot;visits++;
      const pages=selectRotatingFirstPartyPages(pool,now,{rotate:true,rotationSlot});
      expect(pages).toHaveLength(2);expect(new Set(pages).size).toBe(2);
      pages.forEach((page:string)=>seen.add(page));
     }
     expect(visits).toBeGreaterThanOrEqual(length);
     expect(seen).toEqual(new Set(pool));
    }
   }
  }
 });
 it('rejects invalid or unscheduled rotation context before any source request',async()=>{
  const now=new Date(start);
  for(const domain of ['unknown','constructor','__proto__']){
   expect(()=>sourcePulsePageRotationSlot(domain,'unknown',now))
    .toThrow('30M_SOURCE_PAGE_ROTATION_CONTEXT_INVALID');
  }
  const scheduled=select30MinPublishers(now).macro.map((s:any)=>s.id);
  const other=THIRTY_MIN_PUBLISHER_PAIRS.macro.find((id:string)=>!scheduled.includes(id));
  expect(()=>sourcePulsePageRotationSlot('macro',other,now))
   .toThrow('30M_SOURCE_PAGE_ROTATION_CONTEXT_INVALID');
  const source=EXPANDED_OFFICIAL_SOURCES.find((s:any)=>s.id===scheduled[0]);
  for(const cursor of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'0']){
   let requests=0;
   await expect(probeExpandedSource(source,{now,originalPageRotationSlot:cursor,
    fetchImpl:async()=>{requests++;throw Error('MUST_NOT_FETCH');},
   })).rejects.toThrow('ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID');
   expect(requests).toBe(0);
   expect(()=>selectRotatingFirstPartyPages(urls,now,{rotate:true,rotationSlot:cursor}))
    .toThrow('ORIGINAL_PUBLISHER_ROTATION_INPUT_INVALID');
  }
 });
 it('visits all Treasury pages under the actual publisher schedule without increasing its two-page budget',async()=>{
  const pages=new Set<string>();let visits=0;
  for(let slot=0;slot<32;slot++){
   const now=new Date(start+slot*30*60000);
   await probe30MinThreeDomainPulse({now,probe:async(source:any,options:any)=>{
    if(source.id!=='uk_hmt_original_treasury_atom_review')return observed(source);
    let calls=0;
    const result=await probeExpandedSource(source,{...options,
     fetchImpl:async(url:string,opts:RequestInit)=>{
      calls++;
      if(url===source.url)return new Response(feed,{headers:{'content-type':'application/atom+xml'}});
      expect(urls).toContain(url);expect(opts.redirect).toBe('error');
      pages.add(url);visits++;
      const original=new Date(now.getTime()-60000).toISOString();
      return new Response('<html><head><meta name="govuk:first-published-at" content="'+original+'"></head></html>',
       {headers:{'content-type':'text/html'}});
     },
    });
    expect(calls).toBe(3); // one feed and exactly two original pages
    expect(result.original_page_precise_date_checks).toBe(2);
    expect(result.private_original_article_candidates).toHaveLength(2);
    expect(result.commercial_eligible).toBe(false);
    expect(result.current_scored_intelligence_verified).toBe(false);
    return result;
   }});
  }
  expect(visits).toBe(32);
  expect(pages).toEqual(new Set(urls));
 });
});
