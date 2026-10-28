import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

export const PUBLIC_RESEARCH_INDEX_CATEGORIES=[
 {key:"geopolitics",name:"Geopolitics"},
 {key:"macro",name:"Macro / FX"},
 {key:"rare_earth",name:"Critical Minerals"},
] as const;
export type PublicResearchCategoryKey=(typeof PUBLIC_RESEARCH_INDEX_CATEGORIES)[number]["key"];
export type PublicRiskResearchActivity={
 category:PublicResearchCategoryKey;count:number;lastNativePublishedAt:string|null;
};
/**
 * Same already-published, source-redacted static Finds as Intelligence.
 * Not the private scored journal, not a GRI calculation, not a new
 * certified assessment, and no public D1/B2/Supabase or PREDGE request.
 */
export function summarizePublicRiskResearch(signals:readonly StatelessIntelligenceSignal[],now=Date.now()){
 if(!Array.isArray(signals)||signals.length>600||!Number.isFinite(now))
  throw Error("RISK_RESEARCH_PUBLIC_FEED_INVALID");
 const accepted=new Set<string>();
 const rows=PUBLIC_RESEARCH_INDEX_CATEGORIES.map(spec=>{
  let count=0,lastNativePublishedAt:string|null=null;
  for(const signal of signals){
   if(signal.category!==spec.key||
    signal.status!=="official_release_observed_unscored"||
    !/^(geopolitics|macro|rare_earth)-[a-f0-9]{8}$/.test(signal.id)||
    accepted.has(signal.id))continue;
   const native=Date.parse(signal.published_at);
   if(!Number.isFinite(native)||native>now||now-native>72*60*60_000)continue;
   accepted.add(signal.id);
   count++;
   if(lastNativePublishedAt===null||
    native>Date.parse(lastNativePublishedAt))lastNativePublishedAt=signal.published_at;
  }
  return {category:spec.key,count,lastNativePublishedAt};
 });
 return rows as PublicRiskResearchActivity[];
}
