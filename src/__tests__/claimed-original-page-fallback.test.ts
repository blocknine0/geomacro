import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {fetchOriginalAlternate,ORIGINAL_PUBLISHER_ALTERNATES} from '../../scripts/lib/official-native-alternates.mjs';
import {recoverPrivateOfficialRssMissingDates,fetchOfficialNativeArticles,OFFICIAL_NATIVE_FEEDS} from '../../scripts/lib/official-native-rss.mjs';

const now=new Date('2026-10-15T18:00:00.000Z');
const clock='2026-10-15T17:00:00.000Z';
const hash=(url:string)=>createHash('sha256').update(url).digest('hex');
const html=(at=clock)=>'<html><head><meta property="article:published_time" content="'+at+'"></head></html>';
const http=(body:string,type:string)=>new Response(body,{headers:{'content-type':type}});

describe('D1-claimed original page selection before bounded fallback',()=>{
 for(const category of ['macro','rare_earth']){
  it('finds the claimed later '+category+' Atom page despite unrelated undated and published entries',async()=>{
   const root=category==='macro'
    ?'https://www150.statcan.gc.ca/n1/daily-quotidien/261015/dq261015'
    :'https://www.canada.ca/en/natural-resources-canada/news/2026/10/mineral-release-';
   const urls=['first','second','published','claimed'].map(id=>root+id+(category==='macro'?'-eng.htm':'.html'));
   const xml='<feed>'+urls.map((url,i)=>'<entry><title>Official original economic mineral announcement '+i+'</title>'+
    '<link rel="alternate" href="'+url+'"/><updated>'+now.toISOString()+'</updated>'+
    (i===2?'<published>'+clock+'</published>':'')+'</entry>').join('')+'</feed>';
   const id=hash(urls[3]),pages:string[]=[];
   const rows=await fetchOriginalAlternate(category,{now,broadPrivateIntake:true,
    pulseRefs:new Set([id]),pulseExpectedClocks:new Map([[id,clock]]),
    fetchImpl:async(url:string)=>{
     if(url===ORIGINAL_PUBLISHER_ALTERNATES[category].url)return http(xml,'application/atom+xml');
     pages.push(url);return http(html(),'text/html');
    },
   });
   expect(rows).toHaveLength(1);expect(rows[0].url).toBe(urls[3]);
   expect(rows[0].publishedAt).toBe(clock);expect(pages).toEqual([urls[3]]);
   expect(rows[0].rightsVerified).toBe(false);expect(rows[0].commercialEligible).toBe(false);
  });
 }
 it('uses only the exact claimed primary Fed RSS page under the two-page cap',async()=>{
  const root='https://www.federalreserve.gov/newsevents/pressreleases/monetary20261015';
  const urls=['a','b','c'].map(id=>root+id+'.htm'),id=hash(urls[2]);
  const xml='<rss><channel>'+urls.map(url=>'<item><title>Federal Reserve original monetary announcement</title>'+
   '<link>'+url+'</link></item>').join('')+'</channel></rss>';
  const pages:string[]=[];
  const rows=await recoverPrivateOfficialRssMissingDates(xml,'macro',{
   now,broadPrivateIntake:true,pulseRefs:new Set([id]),pulseExpectedClocks:new Map([[id,clock]]),
   fetchImpl:async(url:string)=>{pages.push(url);return http(html(),'text/html');},
  });
  expect(rows).toHaveLength(1);expect(rows[0].url).toBe(urls[2]);
  expect(pages).toEqual([urls[2]]);
 });
});

// Exercise the existing D1 readers, claimed-work validator and complete native
// discovery function; helpers alone cannot prove scope reaches the real caller.
it('passes authenticated D1 SHA/native-clock scope through the full automatic discovery path',async()=>{
 const category='rare_earth';
 const root='https://www.canada.ca/en/natural-resources-canada/news/2026/10/mineral-release-';
 const urls=['one','two','published','claimed'].map(id=>root+id+'.html'),id=hash(urls[3]);
 const xml='<feed>'+urls.map((url,i)=>'<entry><title>Official critical minerals original announcement</title>'+
  '<link rel="alternate" href="'+url+'"/>'+(i===2?'<published>'+clock+'</published>':'')+'</entry>').join('')+'</feed>';
 const at=now.toISOString();
 const pulse={schema:'geomacro.private-source-pulse-checkpoint.v1',domain:category,
  checked_at:at,commercial_eligible:false,original_review_claims_verified:false,
  original_publisher_date_observed:true,new_private_article_fingerprint_count:1,
  newly_seen_private_article_refs:[id],private_classifier_work_refs:[id],
  recent_private_article_fingerprints:[{domain:category,article_sha256:id,native_published_at:clock}]};
 const ledger={schema:'geomacro.private-original-classifier-attempts.v1',domain:category,
  records:[{domain:category,article_sha256:id,native_published_at:clock,attempts:1,
   status:'CLAIMED',claimed_at:at,run_id:'100',acknowledged_at:null}]};
 const argv=process.argv;
 try{
  for(const [key,value] of Object.entries({GEOMACRO_AUTOMATIC_D1_PULSE_STAGE:'true',
   GITHUB_REPOSITORY:'blocknine0/geomacro',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'100',
   CLOUDFLARE_ACCOUNT_ID:'fixture-account',CLOUDFLARE_API_TOKEN:'fixture-token',D1_DATABASE_ID:'fixture-db'}))
   vi.stubEnv(key,value);
  process.argv=[...argv,'--private-scored-stage'];
  let queries=0;const pages:string[]=[];
  vi.stubGlobal('fetch',async(url:string,options:any)=>{
   expect(url).toContain('api.cloudflare.com/client/v4/accounts/fixture-account/');
   const pipeline=JSON.parse(options.body).params[0];queries++;
   const value=pipeline==='official_source_pulse_30m'?pulse:ledger;
   return Response.json({success:true,result:[{success:true,results:[{
    scope:category,last_attempt_at:at,metadata_json:JSON.stringify(value),cursor:'{}',
   }]}]});
  });
  const rows=await fetchOfficialNativeArticles(category,{now,broadPrivateIntake:true,
   includeSecondPublisher:true,includeOriginalPageDateFallback:true,
   fetchImpl:async(url:string)=>{
    if(url===OFFICIAL_NATIVE_FEEDS[category].url)return http('<rss><channel></channel></rss>','application/rss+xml');
    if(url===ORIGINAL_PUBLISHER_ALTERNATES[category].url)return http(xml,'application/atom+xml');
    pages.push(url);expect(url).toBe(urls[3]);return http(html(),'text/html');
   },
  });
  expect(queries).toBe(2);expect(pages).toEqual([urls[3]]);
  expect(rows).toHaveLength(1);expect(rows[0].url).toBe(urls[3]);
  expect(rows[0].publishedAt).toBe(clock);expect(rows[0].commercialEligible).toBe(false);
 }finally{process.argv=argv;vi.unstubAllEnvs();vi.unstubAllGlobals();}
});

it('rejects partial, excessive, unbound and noncanonical scope before source fetches',async()=>{
 const id='a'.repeat(64),other='b'.repeat(64);
 for(const scope of [
  {pulseRefs:new Set([id]),pulseExpectedClocks:null},
  {pulseRefs:new Set([id]),pulseExpectedClocks:new Map([[other,clock]])},
  {pulseRefs:new Set([id,other]),pulseExpectedClocks:new Map([[id,clock],[other,clock]])},
  {pulseRefs:new Set([id]),pulseExpectedClocks:new Map([[id,'2026-10-15T17:00:00']])},
 ]){
  let requests=0;const fetchImpl=async()=>{requests++;return http('', 'text/html');};
  await expect(fetchOriginalAlternate('macro',{now,...scope,fetchImpl}))
   .rejects.toThrow('PRIVATE_PULSE_ARTICLE_CONTEXT_INVALID');
  await expect(recoverPrivateOfficialRssMissingDates('<rss/>','macro',{now,...scope,fetchImpl}))
   .rejects.toThrow('PRIVATE_PULSE_ARTICLE_CONTEXT_INVALID');
  expect(requests).toBe(0);
 }
});

it('does not admit changed page clocks or rescue supplied invalid/future/empty Atom publication metadata',async()=>{
 const url='https://www.canada.ca/en/natural-resources-canada/news/2026/10/mineral-release-claimed.html';
 const id=hash(url),scope={pulseRefs:new Set([id]),pulseExpectedClocks:new Map([[id,clock]])};
 const feed=(published:string)=>'<feed><entry><title>Official original critical minerals announcement</title>'+
  '<link rel="alternate" href="'+url+'"/>'+published+'</entry></feed>';
 for(const metadata of ['<published>invalid</published>',
  '<published>2026-10-16T17:00:00Z</published>','<published/>',
  '<published>2026-10-15T17:00:00</published>']){
  let pageCalls=0;
  const rows=await fetchOriginalAlternate('rare_earth',{now,broadPrivateIntake:true,...scope,
   fetchImpl:async(request:string)=>request===ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url
    ?http(feed(metadata),'application/atom+xml')
    :(pageCalls++,http(html(),'text/html')),
  });
  expect(rows).toEqual([]);expect(pageCalls).toBe(0);
 }
 const rows=await fetchOriginalAlternate('rare_earth',{now,broadPrivateIntake:true,...scope,
  fetchImpl:async(request:string)=>request===ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url
   ?http(feed(''),'application/atom+xml'):http(html('2026-10-15T17:01:00.000Z'),'text/html'),
 });
 expect(rows).toEqual([]);
});
