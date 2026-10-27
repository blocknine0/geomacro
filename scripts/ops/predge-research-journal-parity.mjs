// Bounded read-only acceptance. Reconstruct both projections from the same
// public derived D1 journal; never fetch publishers or log individual rows.
import {buildDerivedNewsStructural} from '../../src/lib/derived-news-structural-bridge.ts';
export async function readPredgeJournal(get){
 const signals=[],seen=new Set();
 for(const offset of [0,250,500]){
  const r=await get('public/website-derived-news-immediate'+(offset?'?offset='+offset:''));
  const p=r.body;
  if(r.status!==200||p?.ok!==true||p.page_offset!==offset||p.page_size!==250||
     !Array.isArray(p.signals)||p.signals.length>250||typeof p.has_more!=='boolean')
   throw Error('PREDGE_JOURNAL_INVALID');
  for(const s of p.signals){
   if(typeof s?.id!=='string'||seen.has(s.id))throw Error('PREDGE_JOURNAL_INVALID');
   seen.add(s.id);signals.push(s);
  }
  if(!p.has_more){if(p.next_offset!==null)throw Error('PREDGE_JOURNAL_INVALID');return signals;}
  if(offset===500||p.next_offset!==offset+250)throw Error('PREDGE_JOURNAL_INVALID');
 }
 throw Error('PREDGE_JOURNAL_INVALID');
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
