import {afterEach,describe,expect,it,vi} from 'vitest';
import {discoverOnDemandForPrivateQualification} from './on-demand-global-discovery.server';
import {readStatelessWebsiteIntelligence} from './stateless-public-intelligence.server';
import {readCategoryLiveObservation} from './category-live-observation.server';
const now=new Date('2026-10-16T08:00:00Z');
const titles={geo:'Zambia ceasefire and security council peace talks',macro:'Zambia banking regulation and inflation monetary policy',minerals:'Zambia copper critical minerals supply agreement'};
const item=(title:string,url:string)=>`<rss><channel><item><title>${title}</title><link>${url}</link><pubDate>Fri, 16 Oct 2026 07:00:00 GMT</pubDate></item></channel></rss>`;
const network=(async(target:RequestInfo|URL)=>{
 const u=new URL(String(target));
 if(u.hostname==='api.worldbank.org')return Response.json([{page:1},[{id:'ZMB',name:'Zambia'}]]);
 if(u.hostname==='press.un.org')return new Response(item(titles.geo,'https://press.un.org/en/2026/sc16478.doc.htm'),{headers:{'content-type':'application/rss+xml'}});
 if(u.hostname==='news.un.org')return new Response(item(u.pathname.includes('economic-development')?titles.macro:titles.minerals,'https://news.un.org/en/story/2026/10/1160000'),{headers:{'content-type':'application/rss+xml'}});
 if(u.hostname==='www.bis.org')return new Response(`<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>${titles.macro}</title><link>https://www.bis.org/press/p261016.htm</link><dc:date>2026-10-16T07:00:00Z</dc:date></item></rdf:RDF>`,{headers:{'content-type':'application/rss+xml'}});
 if(u.hostname==='www.boj.or.jp')return new Response(item('Japan inflation and monetary policy review','http://www.boj.or.jp/en/about/press/koen_2026/ko261015a.htm'),{headers:{'content-type':'application/rss+xml'}});
 if(u.hostname==='www.gov.uk')return new Response('<feed></feed>',{headers:{'content-type':'application/atom+xml'}});
 return new Response('',{status:503});
}) as typeof fetch;
afterEach(()=>vi.unstubAllGlobals());
describe('international original releases in the existing global pipeline',()=>{
 it('three current country categories reserve international publishers within the same twelve-request budget',async()=>{
  const r=await discoverOnDemandForPrivateQualification({country_iso3:'ZMB',categories:['geopolitics','macro','rare_earth'],topics:['conflict_geopolitics','macro_risk','critical_minerals'],max_age_seconds:86400},{fetchImpl:network,now});
  expect(r.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(new Set(r.private_candidates.map(c=>c.domain))).toEqual(new Set(['geopolitics','macro','rare_earth']));
  expect(r.private_candidates.some(c=>c.publisher_family==='bis_original_publisher')).toBe(true);
  expect(r.private_candidates.every(c=>!c.paid_delivery_allowed&&!c.independent_same_event_verified)).toBe(true);
  const publicPayload=JSON.stringify(r.discovery);
  for(const t of Object.values(titles))expect(publicPayload).not.toContain(t);
  expect(publicPayload).not.toContain('https://');expect(r.discovery.supabase_requests+r.discovery.b2_requests).toBe(0);
 });
 it('each existing category reader derives original-clock findings from international feeds with the fifteen-minute delay',async()=>{
  vi.stubGlobal('fetch',network);
  for(const [category,api] of [['geopolitics','geopolitics'],['macro','macro-fx'],['rare_earth','critical-minerals']] as const){
   const source=await readStatelessWebsiteIntelligence(category,now.getTime());
   expect(source.current_24h_count).toBeGreaterThan(0);
   const observed=await readCategoryLiveObservation(api,{now:now.getTime(),reader:async()=>source});
   expect(observed.findings.length).toBeGreaterThan(0);expect(observed.publication_delay_minutes).toBe(15);
   expect(observed.latest_original_published_at).toBe('2026-10-16T07:00:00.000Z');
   expect(observed.raw_publisher_content_delivered).toBe(false);expect(observed.signed_gro_generated).toBe(false);
   const output=JSON.stringify(observed);expect(output).not.toContain('https://');
   for(const t of Object.values(titles))expect(output).not.toContain(t);
  }
 });
});
describe('global publisher searches preserve originating clocks and existing story identity',()=>{
 it('uses Content API first publication, never fresh search index time, and retains an existing issuer card once',async()=>{
  const path='/government/news/zambia-copper-critical-minerals-agreement';
  let published='2026-10-16T06:00:00Z',legacy=true;
  const actual=(async(target:RequestInfo|URL)=>{
   const u=new URL(String(target));
   if(u.hostname!=='www.gov.uk')return new Response('',{status:503});
   if(u.pathname==='/api/search.json')return Response.json({total:1,results:[{title:titles.minerals,link:path,public_timestamp:'2026-10-16T07:59:00Z'}]});
   if(u.pathname==='/api/content'+path)return Response.json({base_path:path,title:titles.minerals,document_type:'news_story',first_published_at:published,public_updated_at:'2026-10-16T07:59:00Z'});
   if(legacy&&u.pathname.includes('department-for-business-innovation-science-and-trade.atom'))return new Response(`<feed><entry><title>${titles.minerals}</title><published>${published}</published><link rel="alternate" href="https://www.gov.uk${path}"/></entry></feed>`,{headers:{'content-type':'application/atom+xml'}});
   return new Response('',{status:503});
  }) as typeof fetch;
  vi.stubGlobal('fetch',actual);
  const current=await readStatelessWebsiteIntelligence('rare_earth',now.getTime());
  expect(current.current_24h_count).toBe(1);expect(current.signals).toHaveLength(1);
  expect(current.signals[0].published_at).toBe('2026-10-16T06:00:00.000Z');
  legacy=false;published='2025-01-01T06:00:00Z';
  const stale=await readStatelessWebsiteIntelligence('rare_earth',now.getTime());
  expect(stale.signals).toHaveLength(0);expect(stale.current_24h_count).toBe(0);
  published='2026-10-17T06:00:00Z';
  expect((await readStatelessWebsiteIntelligence('rare_earth',now.getTime())).signals).toHaveLength(0);
 });
});

describe('Canadian publisher additions',()=>{
 const rdf=(title:string,url:string)=>`<rdf:RDF xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>${title}</title><link>${url}</link><dc:date>2026-10-16T07:00:00Z</dc:date></item></rdf:RDF>`;
 const issuerNetwork=(async(target:RequestInfo|URL)=>{
  const u=new URL(String(target));
  if(u.hostname==='api.worldbank.org')return Response.json([{page:1},[{id:'AUS',name:'Australia'}]]);
  if(u.hostname==='www.bankofcanada.ca')return new Response(rdf('Canada monetary policy and inflation decision','https://www.bankofcanada.ca/2026/10/canada-monetary-policy/'),{headers:{'content-type':'application/rss+xml'}});
  if(u.hostname==='news.gov.bc.ca')return new Response(item('Canada copper critical minerals mining agreement','https://news.gov.bc.ca/releases/2026MCM0031-001120'),{headers:{'content-type':'application/rss+xml'}});
  return new Response('',{status:503});
 }) as typeof fetch;
 it('separate website category reads derive new issuers without copying titles or URLs',async()=>{
  vi.stubGlobal('fetch',issuerNetwork);
  for(const [category,count] of [['macro',1],['rare_earth',1]] as const){
   const r=await readStatelessWebsiteIntelligence(category,now.getTime());
   expect(r.current_24h_count).toBe(count);
   expect(JSON.stringify(r.signals)).not.toMatch(/https:\/\/|Australia monetary policy and inflation decision|Canada copper critical minerals mining agreement/);
  }
 });
 it('a combined Canadian request reserves its native central bank in the existing budget',async()=>{
  const r=await discoverOnDemandForPrivateQualification({country_iso3:'CAN',categories:['geopolitics','macro','rare_earth'],topics:['conflict_geopolitics','macro_risk','critical_minerals'],max_age_seconds:86400},{fetchImpl:issuerNetwork,now});
  expect(r.discovery.network_attempts).toBeLessThanOrEqual(12);
  expect(r.private_candidates.some(c=>c.publisher_family==='boc_original_publisher')).toBe(true);
  expect(r.private_candidates.every(c=>!c.paid_delivery_allowed&&!c.independent_same_event_verified)).toBe(true);
 });
});
