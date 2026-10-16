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
