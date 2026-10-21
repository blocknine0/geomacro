/**
 * Noncommercial, private source-reference preflight. Perform the same
 * fail-closed public-signal derivation before a batch PUT so one bad source
 * does not prevent already-valid signed mappings from reaching private D1.
 * No external source, article, content hash or private URL enters receipts.
 */
import {automatedInputId} from '../../src/lib/automated-intelligence-input.ts';
import {canonicalizePrivateOriginalSourceClock} from '../../src/lib/private-source-handoff.ts';
import {deriveStatelessSignals,type StatelessSourceCandidate,
  type StatelessIntelligenceSignal} from '../../src/lib/stateless-intelligence-model.ts';

export type RefPreflightReason =
  'ELIGIBLE'|'SHAPE_INVALID'|'URL_INVALID'|'ORIGINAL_CLOCK_DIFFERENT'|
  'SOURCE_DERIVATION_MISMATCH'|'SIGNED_ID_MISMATCH';

export async function preflightPrivateSourceReference({
  signal,original,inputId,now=Date.now(),
}:{
  signal:StatelessIntelligenceSignal;original:StatelessSourceCandidate;inputId:string;now?:number;
}):Promise<{reason:RefPreflightReason;ref?:StatelessSourceCandidate}>{
  if(!signal||!original||typeof original!=='object'||
    !['geopolitics','macro','rare_earth'].includes(signal.category)||
    typeof original.title!=='string'||!original.title||
    original.title.length>2000||typeof original.sourceId!=='string'||
    !/^[a-zA-Z0-9_.:-]{1,128}$/u.test(original.sourceId)||
    !(original.credit===null||typeof original.credit==='string'&&original.credit.length<=1000)||
    original.category!==signal.category||
    Object.keys(original).some(k=>!['title','articleUrl','publishedAt','datePrecision','sourceId','category','credit'].includes(k)))
    return {reason:'SHAPE_INVALID'};
  let url:URL;
  try{url=new URL(original.articleUrl)}catch{return {reason:'URL_INVALID'}}
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    url.search||url.hash||url.href!==original.articleUrl||
    original.articleUrl.length>2048)
    return {reason:'URL_INVALID'};
  const ref=canonicalizePrivateOriginalSourceClock(original,signal);
  if(ref.publishedAt!==signal.published_at)return {reason:'ORIGINAL_CLOCK_DIFFERENT'};
  const derived=deriveStatelessSignals([ref],now)[0];
  if(!derived||Object.keys(derived).length!==Object.keys(signal).length||
    Object.keys(derived).some(k=>
      JSON.stringify((derived as unknown as Record<string,unknown>)[k])!==
      JSON.stringify((signal as unknown as Record<string,unknown>)[k])))
    return {reason:'SOURCE_DERIVATION_MISMATCH'};
  if(derived.id!==signal.id||await automatedInputId(signal)!==inputId)
    return {reason:'SIGNED_ID_MISMATCH'};
  return {reason:'ELIGIBLE',ref};
}
