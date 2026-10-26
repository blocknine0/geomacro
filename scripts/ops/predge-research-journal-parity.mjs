// Bounded read-only acceptance. Reconstruct both projections from the same
// public derived D1 journal; never fetch publishers or log individual rows.
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
export async function readPredgeJournal(get){
 const r=await get('public/website-derived-news-bundle',{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store'});
 const p=r?.body;
 if(r?.status!==200||p?.ok!==true||
    p.schema!=="geomacro.website-derived-news-bundle.v1"||
    p.complete!==true||p.item_cap!==600||p.returned_rows!==p.signals?.length||
    p.delivery_scope!=="free_website_only"||p.retention_hours!==72||
    p.original_release_delay_minutes!==0||
    !Array.isArray(p.signals)||p.signals.length>600||
    !Array.isArray(p.first_ingest)||p.first_ingest.length!==p.signals.length||
    p.first_ingest.some((row,i)=>!row||row.id!==p.signals[i]?.id||
      !(row.first_seen_at===null||typeof row.first_seen_at==="string"&&Number.isFinite(Date.parse(row.first_seen_at)))))
  throw Error('PREDGE_JOURNAL_INVALID');
 const seen=new Set();
 for(const signal of p.signals){
  if(typeof signal?.id!=='string'||seen.has(signal.id))throw Error('PREDGE_JOURNAL_INVALID');
  seen.add(signal.id);
 }
 return p.signals;
}
export function predgeJournalParity(research,publicFeed,journal){
 if(!Array.isArray(journal)||journal.length>600)return false;
 try{
  const at=Date.parse(research.generated_at),pt=Date.parse(publicFeed.generated_at);
  const attributed=research.projection==='attributed_research';
  if(attributed&&(research.attribution_must_be_preserved!==true||
      research.attribution_is_not_a_grant_of_source_rights!==true))return false;
  const expected=buildDerivedNewsStructural(journal,at,attributed?'attributed_research':'source_neutral');
  const pub=buildDerivedNewsStructural(journal,pt);
  if(JSON.stringify(research.items)!==JSON.stringify(expected)||
     JSON.stringify(publicFeed.items)!==JSON.stringify(pub))return false;
  return ['geopolitics','macro','rare_earth'].every(c=>
   research.counts?.[c]===expected.filter(s=>s.category===c).length&&
   publicFeed.counts?.[c]===pub.filter(s=>s.category===c).length);
 }catch{return false;}
}
