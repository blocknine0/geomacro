import {describe,it,expect} from 'vitest';
import {generateKeyPairSync} from 'node:crypto';
import {deriveStatelessSignals} from '../lib/stateless-intelligence-model';
import {automatedInputId} from '../lib/automated-intelligence-input';
import {signAutomatedIntelligenceInput} from '../lib/risk-object-signing.server';
import {privateOriginalBodyTopicShapeValid,verifyPrivateSourceHandoff} from '../lib/private-source-handoff';
import {persistPrivateSourceHandoffs} from '../../scripts/ops/persist-private-source-handoffs';
import {refreshRetainedSignal} from '../../scripts/ops/refresh-derived-news-editorial';
const now=new Date(Date.now()-1000);
const originalDay=new Date(now.getTime()-48*3600_000).toISOString().slice(0,10);
const ref={sourceId:'nrcan_releases',category:'rare_earth' as const,
 title:'Canada and Türkiye joint statement on energy cooperation',
 articleUrl:'https://www.canada.ca/en/natural-resources-canada/news/'+originalDay.slice(0,4)+'/'+originalDay.slice(5,7)+'/energy-cooperation-statement.html',
 publishedAt:originalDay,datePrecision:'day' as const,credit:'Natural Resources Canada',
 originalBodyTopic:'critical-minerals policy' as const};
const signal=deriveStatelessSignals([ref],now.getTime())[0];
const issuer=generateKeyPairSync('ed25519');
const publicB64=issuer.publicKey.export({format:'der',type:'spki'}).toString('base64');
const material={key_id:'topic-handoff-test',public_key_spki_b64:publicB64,
 private_key_pkcs8_b64:issuer.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
const keys={[material.key_id]:{public_key_spki_b64:publicB64,status:'active' as const}};
async function signed(){return signAutomatedIntelligenceInput({schema:'geomacro.automated-intelligence-input.v1',
 approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',generated_at:now.toISOString(),
 expires_at:new Date(Date.parse(signal.published_at)+72*3600_000).toISOString(),source_run_id:'1234',source_sha:'a'.repeat(40),
 signal,independent_reviewed:false,commercial_rights_attested:false,scored:false},material);}
describe('retained finite NRCan topic provenance',()=>{
 it('retains a topic bound to the actual signed derived input and stable native day',async()=>{
  const input=await signed(),input_id=await automatedInputId(signal);
  const handoff=await verifyPrivateSourceHandoff({input_id,ref},input,keys,now.getTime());
  expect(handoff.ref.originalBodyTopic).toBe('critical-minerals policy');
  expect(refreshRetainedSignal(signal,handoff.ref,now.getTime())).toEqual(signal);
  expect(input.payload.commercial_rights_attested).toBe(false);
 });
 it('rejects a topic swap against an existing signature',async()=>{
  const input=await signed(),input_id=await automatedInputId(signal);
  await expect(verifyPrivateSourceHandoff({input_id,ref:{...ref,originalBodyTopic:'mineral exploration and production'}},
   input,keys,now.getTime())).rejects.toThrow('PRIVATE_SOURCE_HANDOFF_BINDING_INVALID');
 });
 it('rejects free text, wrong issuer/category/precision and off-origin topic claims',()=>{
  expect(privateOriginalBodyTopicShapeValid(ref)).toBe(true);
  for(const patch of [{originalBodyTopic:'Arbitrary raw article text'}, {sourceId:'fed_press'},
   {category:'macro'}, {datePrecision:undefined}, {articleUrl:'https://attacker.example/original.html'}])
   expect(privateOriginalBodyTopicShapeValid({...ref,...patch} as any)).toBe(false);
 });
 it('publisher sends the finite reference without deferring its new shape or exposing it in receipts',async()=>{
  const input_id=await automatedInputId(signal);let persisted:any;
  const receipt=await persistPrivateSourceHandoffs({refs:new Map([[signal.id,ref]]),now,
   env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:'synthetic-private-test-root'.repeat(2)},
   readJournal:async()=>[signal],fetchImpl:async(url:any,options:any)=>{
    if(String(url).includes('?view=handoff-ids'))return Response.json({ok:true,
     schema:'geomacro.automated-intelligence-input-feed.v1',handoffs:[{input_id,signal_id:signal.id}]});
    persisted=JSON.parse(options.body);
    return Response.json({ok:true,accepted_ids:[input_id]});
   }});
  expect(receipt.references_accepted).toBe(1);
  expect(receipt.original_refs_deferred_shape).toBe(0);
  expect(persisted.items[0].ref).toEqual(ref);
  expect(JSON.stringify(receipt)).not.toContain(ref.articleUrl);
 });
});
