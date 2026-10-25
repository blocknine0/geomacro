import {describe,it,expect,vi,afterEach} from 'vitest';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reviewDerivedInputs,safeLowAuthorityReviewFailure} from '../../scripts/ops/review-derived-inputs-low-authority';
import {automatedInputId} from '../lib/automated-intelligence-input';
import {verifyLowSourceReview} from '../lib/low-authority-source-review';
import {handleLowSourceReviews,lowReviewToken} from '../../workers/control-plane/src/low-source-reviews';
// @ts-expect-error The existing JavaScript Worker entry has no declaration file.
import worker from '../../workers/control-plane/src/index.mjs';
const now=new Date('2026-10-21T12:00:00.000Z');
const pair=generateKeyPairSync('ed25519'),issuer=generateKeyPairSync('ed25519');
const der=pair.publicKey.export({format:'der',type:'spki'}) as Buffer;
const issuerB64=issuer.publicKey.export({format:'der',type:'spki'}).toString('base64');
const trust={public_spki_b64:der.toString('base64'),public_sha256:createHash('sha256').update(der).digest('hex'),issuer_public_keys_b64:[issuerB64]};
const env={GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
 GEOMACRO_LOW_REVIEW_PUBLIC_PEM:pair.publicKey.export({format:'pem',type:'spki'}).toString(),
 GEOMACRO_LOW_REVIEW_PUBLIC_SHA256:trust.public_sha256,
 GEOMACRO_LOW_REVIEW_ISSUER_PUBLIC_KEYS_JSON:JSON.stringify([issuerB64])};
const signal=(category='macro',id='1234abcd')=>({id:category+'-'+id,category,
 published_at:'2026-10-21T11:00:00.000Z',date_precision:'exact',status:'official_release_observed_unscored',
 title:'Geomacro finds official policy developments affecting trade conditions',
 what_changed:'An official publisher issued an original-dated policy release concerning trade conditions.',
 why_it_matters:'Official policy developments can affect trade conditions; implementation needs separate verification.',
 topic:'trade and economic relations',geography:null,development_type:'policy release',
 observed_release_count:1,sources_credited:[],same_event_corrob_verified:false,severity:null}) as any;
const url='https://www.federalreserve.gov/newsevents/pressreleases/monetary20261021a.htm';
const reference={articleUrl:url,category:'macro',sourceId:'fed_press',publishedAt:'2026-10-21T11:00:00.000Z'};
afterEach(()=>vi.unstubAllGlobals());
async function realReview(){
 const html='<html><head><meta property="article:published_time" content="2026-10-21T11:00:00Z"></head><body>Synthetic source page bytes for an offline verification test.</body></html>';
 const fetcher=vi.fn(async()=>new Response(html,{headers:{'Content-Type':'text/html'}}));vi.stubGlobal('fetch',fetcher);
 const items:any[]=[];
 const result=await reviewDerivedInputs({signals:[signal()],originalRefs:new Map([[signal().id,reference]]),env,now,
  persist:async(batch:any[])=>items.push(...batch)});
 return {result,items,fetcher,html};
}
describe('Geomacro internal LOW automated source review',()=>{
 it('drains every retained item despite a continuing stream of newer same-host news, without resetting pending age',async()=>{
  const rows=['geopolitics','macro','rare_earth'].flatMap((category,c)=>Array.from({length:3},(_,i)=>({
   ...signal(category,(c*16+i+1).toString(16).padStart(8,'0')),
   title:'Geomacro finds distinct offline policy development '+c+' '+i,
   what_changed:'Distinct offline policy test action '+c+' '+i,
  })));
  const references=new Map(),previous=new Map(),attempted=new Set<string>();
  const source:any={geopolitics:'uk_mod',macro:'uk_treasury',rare_earth:'uk_dbt'};
  const ref=(s:any)=>({...reference,category:s.category,sourceId:source[s.category],
   articleUrl:'https://www.gov.uk/government/news/offline-distinct-policy-'+s.id.replaceAll('_','-')});
  for(const r of rows)references.set(r.id,ref(r));
  const verifyOriginal=vi.fn(async({reference:r}:any)=>{
   attempted.add(r.articleUrl);
   return {schema:'geomacro.private-unclaimed-original-pre-review.v1',accepted:true,
    status:'ORIGINAL_BYTES_AND_CLOCK_VERIFIED_REVIEW_PENDING',
    original_article_sha256:'c'.repeat(64),original_native_published_at:reference.publishedAt,
    source_article_rights_verified:false,facts_signature_verified:false,rights_signature_verified:false,
    signed_gro_created:false,payment_authorized:false};
  });
  const fresh:any[]=[];let firstPending:any;
  for(let n=0;n<13;n++){
   const item={...signal('geopolitics',(0x90000000+n).toString(16)),
    title:'Geomacro finds new offline policy '+n,what_changed:'New offline event description '+n};
   fresh.push(item);references.set(item.id,ref(item));
   const result=await reviewDerivedInputs({signals:[...rows,...fresh],originalRefs:references,
    previousReviews:previous,env,now:new Date(now.getTime()+n*5*60000),verifyOriginal,
    persist:async(items:any[])=>{for(const item of items)previous.set(item.review.input_id,item)}});
   expect(result.audit.exact_page_byte_rereads_attempted).toBeLessThanOrEqual(1);
   const pending=previous.get(await automatedInputId(rows[8]));
   if(n===0)firstPending=pending;
   if(n===1&&pending.review.verdict==='EVIDENCE_PENDING')expect(pending.signature).toBe(firstPending.signature);
  }
  for(const r of rows){
   expect(attempted.has(references.get(r.id).articleUrl)).toBe(true);
   const proof=previous.get(await automatedInputId(r));
   await verifyLowSourceReview(proof,trust,now.getTime()+12*5*60000);
   expect(proof.review.verdict).toBe('SOURCE_EVIDENCE_VERIFIED');
   expect(proof.review.commercial_authorization).toBe(false);
  }
 });
 it('actually checks HTML bytes/native time and signs only its narrow evidence scope',async()=>{
  const {result,items,fetcher,html}=await realReview();
  expect(fetcher).toHaveBeenCalledOnce();expect(result.source_verified_items).toBe(1);
  await verifyLowSourceReview(items[0],trust,now.getTime());
  expect(items[0].review.evidence_sha256).toBe(createHash('sha256').update(html).digest('hex'));
  expect(items[0].review.semantic_claims_verified).toBe(false);
  expect(items[0].review.commercial_authorization).toBe(false);
  expect(items[0].review.external_reviewer_attested).toBe(false);
  expect(JSON.stringify(items)).not.toContain(url);
 });
 it('automatically reviews all categories but missing references remain pending without GETs',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const items:any[]=[];
  const result=await reviewDerivedInputs({signals:['geopolitics','macro','rare_earth'].map(c=>signal(c)),
   originalRefs:new Map(),env,now,persist:async(batch:any[])=>items.push(...batch)});
  expect(result.reviewed_items).toBe(3);expect(items.every(e=>e.review.verdict==='EVIDENCE_PENDING')).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('refuses the issuer key as reviewer and refuses absent reviewer credentials before source reads',async()=>{
  const verifyOriginal=vi.fn();
  for(const e of [{}, {...env,GEOMACRO_LOW_REVIEW_ISSUER_PUBLIC_KEYS_JSON:JSON.stringify([trust.public_spki_b64])}])
   await expect(reviewDerivedInputs({signals:[signal()],originalRefs:new Map(),env:e,now,verifyOriginal})).rejects.toThrow();
  expect(verifyOriginal).not.toHaveBeenCalled();
 });
 it('rejects altered signed reviews, authority escalation and expired verdicts',async()=>{
  const {items}=await realReview();
  for(const field of ['commercial_authorization','semantic_claims_verified','external_reviewer_attested']){
   const bad=structuredClone(items[0]);bad.review[field]=true;
   await expect(verifyLowSourceReview(bad,trust,now.getTime())).rejects.toThrow();
  }
  const changed=structuredClone(items[0]);changed.review.input_id='a'.repeat(64);
  await expect(verifyLowSourceReview(changed,trust,now.getTime())).rejects.toThrow();
  await expect(verifyLowSourceReview(items[0],trust,now.getTime()+23*3600_000)).rejects.toThrow();
 });
 it('accepts only the scoped review token and never returns reviewer/evidence details',async()=>{
  const {items}=await realReview(),root='x'.repeat(64),scoped=await lowReviewToken(root);
  const batch=vi.fn(async()=>[{success:true},{success:true},{success:true}]);
  const store={CONTROL_PLANE_TOKEN:root,AUTOMATED_FINDS_VERIFY_KEYS_JSON:JSON.stringify({issuer:issuerB64}),
   GEOMACRO_LOW_REVIEW_PUBLIC_SPKI_B64:trust.public_spki_b64,GEOMACRO_LOW_REVIEW_PUBLIC_SHA256:trust.public_sha256,
   DB:{prepare:()=>({bind:()=>({})}),batch}};
  const req=(token:string)=>new Request('https://control.example/v1/internal/low-source-reviews',{
   method:'PUT',headers:{authorization:'Bearer '+token},body:JSON.stringify({items})});
  for(const token of ['',root])expect((await handleLowSourceReviews(req(token),store,now.getTime())).status).toBe(401);
  expect(batch).not.toHaveBeenCalled();
  const response=await handleLowSourceReviews(req(scoped),store,now.getTime());
  expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,accepted:1});
  const denied=await worker.fetch(new Request('https://control.example/v1/control/attack',{
   method:'PUT',headers:{authorization:'Bearer '+scoped},body:JSON.stringify({value:{}})}),store);
  expect(denied.status).toBe(401);
  const privateRead=await worker.fetch(new Request('https://control.example/v1/internal/low-source-reviews'),store);
  expect(privateRead.status).toBe(401);
 });
 it('keeps the reviewer step separate from issuer/admin secrets and cleans private IPC files',()=>{
  const s=readFileSync('.github/workflows/website-derived-news-continuity.yml','utf8');
  const reviewer=s.split('      - name: Review real source evidence with the separate low authority')[1].split('      - name:')[0];
  for(const forbidden of ['RISK_OBJECT_SIGNING_PRIVATE_KEY','GEOMACRO_COMMERCE_LEDGER_TOKEN','B2_APPLICATION_KEY','CLOUDFLARE_API_TOKEN'])
   expect(reviewer).not.toContain(forbidden);
  expect(reviewer).toContain('GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64');
  expect(s).toContain('Remove private review handoff and internal verdicts from the runner');
  expect(s).not.toContain('path: ${{ runner.temp }}');
 });
});


describe('sanitized low-authority review failure receipt',()=>{
 it('exposes bounded stable codes but never exception text containing private details',()=>{
  expect(safeLowAuthorityReviewFailure(new Error('PERSIST'))).toBe('PERSIST');
  expect(safeLowAuthorityReviewFailure(new Error('LOW_REVIEW_KEY_MISMATCH'))).toBe('LOW_REVIEW_KEY_MISMATCH');
  expect(safeLowAuthorityReviewFailure(new Error('private original URL https://example.com or secret-key')))
   .toBe('LOW_AUTHORITY_REVIEW_UNCLASSIFIED_FAILURE');
  expect(safeLowAuthorityReviewFailure(new Error('D1 write failed: raw exception')))
   .toBe('LOW_AUTHORITY_REVIEW_UNCLASSIFIED_FAILURE');
 });
});
