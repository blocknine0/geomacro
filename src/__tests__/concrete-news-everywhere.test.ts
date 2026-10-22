import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {generateKeyPairSync} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {deriveStatelessSignals,parseFirstPartyFeed} from '../lib/stateless-intelligence-model';
import {signAutomatedIntelligenceInput} from '../lib/risk-object-signing.server';
import {automatedInputId} from '../lib/automated-intelligence-input';
import {verifyPrivateSourceHandoff} from '../lib/private-source-handoff';
import {findCardFromObservedRelease} from '../lib/find-card-v1';
import {StatelessLiveDesk} from '../components/intelligence/stateless-live-desk';
import {readDerivedStories,renderDerivedStoriesHtml} from '../../workers/control-plane/src/website-derived-intelligence.mjs';

const candidate=(now:number)=>({sourceId:'uk_fcdo',category:'geopolitics' as const,
 title:'New sanctions policy update',description:'Foreign Secretary Yvette Cooper announced sanctions on Russia.',
 articleUrl:'https://www.gov.uk/government/news/example-sanctions-policy',
 publishedAt:new Date(now-3600000).toISOString(),credit:null});

describe('specific facts across every public news presentation',()=>{
 it('keeps the original lead private while the public signal states the named actor and action',()=>{
  const now=Date.now(),ref=candidate(now),signal=deriveStatelessSignals([ref],now)[0];
  expect(signal.what_changed).toContain('Foreign Secretary Yvette Cooper announced sanctions on Russia');
  expect(signal.what_changed).not.toContain('An official publisher');
  expect(signal.published_at).toBe(ref.publishedAt);
  expect(signal).not.toHaveProperty('description');expect(signal).not.toHaveProperty('sourceId');
  expect(JSON.stringify(signal)).not.toContain(ref.articleUrl);
  expect(signal.severity).toBeNull();expect(signal.same_event_corrob_verified).toBe(false);
 });
 it('accepts genuine signatures for all three editorial generations without mutating old inputs',async()=>{
  const now=Date.now(),ref=candidate(now),keys=generateKeyPairSync('ed25519');
  const material={key_id:'news-editorial-version-test',
   public_key_spki_b64:keys.publicKey.export({type:'spki',format:'der'}).toString('base64'),
   private_key_pkcs8_b64:keys.privateKey.export({type:'pkcs8',format:'der'}).toString('base64')};
  const ids=[];
  for(const editorialVersion of ['legacy_v1','actor_action_v2','news_facts_v3'] as const){
   const signal=deriveStatelessSignals([ref],now,{editorialVersion})[0];
   const input_id=await automatedInputId(signal);ids.push(input_id);
   const input=await signAutomatedIntelligenceInput({schema:'geomacro.automated-intelligence-input.v1',
    approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',
    generated_at:new Date(now).toISOString(),expires_at:new Date(Date.parse(ref.publishedAt)+72*3600000).toISOString(),
    source_run_id:'1',source_sha:'a'.repeat(40),independent_reviewed:false,commercial_rights_attested:false,scored:false,signal},material);
   await expect(verifyPrivateSourceHandoff({input_id,ref},input,{[material.key_id]:material.public_key_spki_b64},now)).resolves.toBeTruthy();
  }
  expect(ids[2]).not.toBe(ids[0]);expect(ids[2]).not.toBe(ids[1]);
 });
 it('renders a concrete retained revision over an old generic live response and never renders generic records',()=>{
  const now=Date.now(),specific=deriveStatelessSignals([candidate(now)],now)[0];
  const generic={...specific,title:'Geomacro finds policy update on foreign policy',what_changed:'An official publisher released a policy update about foreign policy.'};
  const initial={category:'geopolitics',healthy_feed_count:1,checked_at:new Date(now).toISOString(),signals:[generic]} as any;
  const html=renderToStaticMarkup(createElement(StatelessLiveDesk,{initial,initialJournal:[specific]}));
  expect(html).toContain('Foreign Secretary Yvette Cooper');expect(html).toContain('sanctions on Russia');
  expect(html).not.toContain('An official publisher');
  const pending=renderToStaticMarkup(createElement(StatelessLiveDesk,{initial,initialJournal:[]}));
  expect(pending).not.toContain('An official publisher');expect(pending).toContain('additional release awaits specific event details');
  expect((html.match(/aria-pressed=/gu)??[])).toHaveLength(3);
 });
 it('does not replace event-specific text with a generic template when creating Find Cards',()=>{
  const now=Date.now(),signal=deriveStatelessSignals([candidate(now)],now)[0];
  const card=findCardFromObservedRelease(signal,now);
  expect(card?.headline).toContain('Yvette Cooper');expect(card?.what_changed).toContain('sanctions on Russia');
  expect(card?.what_changed).not.toContain('Classified topic');expect(card?.published_at).toBe(signal.published_at);
  expect(findCardFromObservedRelease({...signal,what_changed:'An official publisher released a policy update.'},now)).toBeNull();
 });
 it('filters only the HTML presentation, keeping retained generic source records in the exact journal',async()=>{
  const now=Date.now(),specific=deriveStatelessSignals([candidate(now)],now)[0];
  const generic={...specific,id:'geopolitics-deadbeef',what_changed:'An official publisher released a policy update.'};
  const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[specific,generic].map(s=>({story_json:JSON.stringify(s),first_seen_at:new Date(now-1800000).toISOString()}))})})})}};
  const journal=await (await readDerivedStories(env,now)).json();expect(journal.signals).toHaveLength(2);
  const html=await (await renderDerivedStoriesHtml(env,now)).text();
  expect(html).toContain('Yvette Cooper');expect(html).not.toContain('An official publisher');
 });
 it('preserves RSS lead text only inside the private candidate, without changing native time',()=>{
  const now=Date.now(),at=new Date(now-3600000).toUTCString();
  const source={id:'uk_test',category:'geopolitics' as const,media:'rss' as const,
   url:'https://example.gov/feed',allowedHosts:['example.gov'],credit:null};
  const xml='<rss><channel><item><title>New sanctions policy update</title><link>https://example.gov/news/sanctions-policy-example</link><pubDate>'+at+'</pubDate><description>Foreign Secretary Yvette Cooper announced sanctions on Russia.</description></item></channel></rss>';
  const parsed=parseFirstPartyFeed(xml,source,now);
  expect(parsed.dated[0]?.description).toContain('Yvette Cooper');
  const signal=deriveStatelessSignals(parsed.dated,now)[0];expect(signal.what_changed).toContain('Yvette Cooper');
  expect(signal).not.toHaveProperty('description');
 });
});

it('retains authenticated original references for freshly signed editorial revisions in secure private IPC',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,chmodSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {carryRetainedEditorialRefs}=await import('../../scripts/ops/refresh-derived-news-editorial');
 const dir=mkdtempSync(join(tmpdir(),'geomacro-editorial-refs-'));
 try{
  const path=join(dir,'private.json'),ref=candidate(Date.now());
  const env={RUNNER_TEMP:dir,GEOMACRO_LOW_REVIEW_REFS_FILE:path};
  writeFileSync(path,JSON.stringify({refs:[['geopolitics-deadbeef',ref]]}),{mode:0o600});
  carryRetainedEditorialRefs(new Map([['geopolitics-1234abcd',ref]]),new Set(['geopolitics-deadbeef','geopolitics-1234abcd']),env);
  expect(JSON.parse(readFileSync(path,'utf8')).refs.map(([id]:[string,unknown])=>id)).toHaveLength(2);
  chmodSync(path,0o644);
  expect(()=>carryRetainedEditorialRefs(new Map([['geopolitics-1234abcd',ref]]),new Set(['geopolitics-1234abcd']),env)).toThrow('PRIVATE_HANDOFF_FILE_INVALID');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
