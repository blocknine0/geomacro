import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

/**
 * The publication ID already represents category plus exact article identity.
 * Fuzzy title matching erased different country/topic findings and independent
 * reports sharing common terms, so the public desk deduplicates exact IDs only.
 */
const MAX_DEDUPE_ROWS=1600;
const DEDUPE_CATEGORY_ORDER=["geopolitics","macro","rare_earth"] as const;

function boundedRecentRows(rows:readonly StatelessIntelligenceSignal[]){
 if(rows.length<=MAX_DEDUPE_ROWS)return rows;
 const byCategory=new Map(DEDUPE_CATEGORY_ORDER.map(category=>
   [category,[] as {row:StatelessIntelligenceSignal;time:number}[]]));
 for(const row of rows){
  const bucket=byCategory.get(row.category);
  const time=Date.parse(row.published_at);
  if(bucket&&Number.isFinite(time))bucket.push({row,time});
 }
 for(const bucket of byCategory.values())bucket.sort((a,b)=>
  b.time-a.time||a.row.id.localeCompare(b.row.id));
 const bounded:StatelessIntelligenceSignal[]=[];
 for(let offset=0;bounded.length<MAX_DEDUPE_ROWS;offset++){
  let added=false;
  for(const category of DEDUPE_CATEGORY_ORDER){
   const candidate=byCategory.get(category)?.[offset];
   if(candidate&&bounded.length<MAX_DEDUPE_ROWS){bounded.push(candidate.row);added=true;}
  }
  if(!added)break;
 }
 return bounded;
}

/** Remove only exact repeated IDs; preserve distinct reports and category rows. */
export function dedupeIntelligenceStories(rows:readonly StatelessIntelligenceSignal[])
 :StatelessIntelligenceSignal[]{
 if(!Array.isArray(rows))throw Error("INTELLIGENCE_EVENT_DEDUP_INPUT_INVALID");
 const byId=new Map<string,StatelessIntelligenceSignal>();
 for(const row of rows){
  if(!row||typeof row.id!=="string"||!Number.isFinite(Date.parse(row.published_at)))continue;
  const previous=byId.get(row.id);
  if(!previous||previous.status!=="official_release_observed_unscored"&&
     row.status==="official_release_observed_unscored")byId.set(row.id,row);
 }
 return [...boundedRecentRows([...byId.values()])].sort((a,b)=>
  Date.parse(b.published_at)-Date.parse(a.published_at)||a.id.localeCompare(b.id));
}
