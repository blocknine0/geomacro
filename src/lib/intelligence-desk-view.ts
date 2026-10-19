import type {StatelessCategory,StatelessIntelligenceSignal} from "./stateless-intelligence-model";
export type IntelligenceDeskView=StatelessCategory|"all";
export type IntelligenceDeskPeriod="all"|"24h"|"7d";
export const INTELLIGENCE_PAGE_SIZE=12;
export function intelligenceCategorySearch(search:Record<string,unknown>):{category?:IntelligenceDeskView}{
 const value=search.category;
 return value==="all"||value==="geopolitics"||value==="macro"||value==="rare_earth"?{category:value}:{};
}
/** View filtering only; never modifies publisher clocks, licences or evidence. */
export function filterIntelligenceDesk(rows:readonly StatelessIntelligenceSignal[],
 options:{category:IntelligenceDeskView;query:string;period:IntelligenceDeskPeriod},now:number){
 if(!Number.isFinite(now))return [];
 const windowMs=(options.period==="24h"?1:options.period==="7d"?7:30)*86400_000;
 const words=options.query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
 return rows.filter(row=>{
  const time=Date.parse(row.published_at);
  if(!Number.isFinite(time)||time>now||now-time>windowMs||
     options.category!=="all"&&row.category!==options.category)return false;
  const text=[row.title,row.what_changed,row.why_it_matters,row.topic,row.geography??""]
   .join(" ").toLocaleLowerCase();
  return words.every(word=>text.includes(word));
 }).sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at)||a.id.localeCompare(b.id));
}
