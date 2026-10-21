import {automatedInputId,verifyAutomatedInput,type AutomatedInputEnvelope} from './automated-intelligence-input.ts';
import type {StatelessSourceCandidate} from './stateless-intelligence-model.ts';

export type PrivateSourceHandoff={input_id:string;ref:StatelessSourceCandidate};
export async function verifyPrivateSourceHandoff(item:PrivateSourceHandoff,input:AutomatedInputEnvelope,
 keys:Parameters<typeof verifyAutomatedInput>[1],now=Date.now()){
 if(!item||Object.keys(item).sort().join(',')!=='input_id,ref'||!/^[a-f0-9]{64}$/.test(item.input_id))
  throw Error('PRIVATE_SOURCE_HANDOFF_INVALID');
 await verifyAutomatedInput(input,keys,now);
 const r=item.ref;
 if(!r||typeof r!=='object'||Array.isArray(r)||
  Object.keys(r).some(k=>!['title','articleUrl','publishedAt','datePrecision','sourceId','category','credit'].includes(k))||
  typeof r.title!=='string'||r.title.length<1||r.title.length>2000||
  typeof r.articleUrl!=='string'||r.articleUrl.length>2048||
  typeof r.sourceId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(r.sourceId)||
  !(r.credit===null||typeof r.credit==='string'&&r.credit.length<=1000)||
  r.publishedAt!==input.payload.signal.published_at||r.category!==input.payload.signal.category)
  throw Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_INVALID');
 const u=new URL(r.articleUrl);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.href!==r.articleUrl)
  throw Error('PRIVATE_SOURCE_HANDOFF_REFERENCE_INVALID');
 // Reproduce the exact derived content, rather than accepting an arbitrary
 // URL attached to an approved input. This is provenance, NOT source approval.
 const {deriveStatelessSignals}=await import('./stateless-intelligence-model.ts');
 const derived=deriveStatelessSignals([r],now)[0];
 if(!derived||derived.id!==input.payload.signal.id||await automatedInputId(derived)!==item.input_id||
  await automatedInputId(input.payload.signal)!==item.input_id)
  throw Error('PRIVATE_SOURCE_HANDOFF_BINDING_INVALID');
 return {schema:'geomacro.private-source-handoff.v1' as const,...item,
  expires_at:input.payload.expires_at};
}
