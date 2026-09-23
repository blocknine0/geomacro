const TRUST={OFFICIAL:0.9,STRUCTURED:0.8,VERIFIED_TELEGRAM:0.65,EARLY_SIGNAL_TELEGRAM:0.35,GLOBAL_FALLBACK:0.45};
export function verifyObservations(observations,{minIndependentSources=2}={}){
  const groups=new Map();
  for(const o of observations){
    const key=(o.title||o.summary||"").toLowerCase().replace(/[^a-z0-9 ]/g,"").split(/\s+/).slice(0,12).join(" ");
    if(!key) continue;
    const g=groups.get(key)||{observations:[],sources:new Set()};
    g.observations.push(o); g.sources.add(o.source_id); groups.set(key,g);
  }
  return [...groups.values()].map(g=>{
    const sourceCount=g.sources.size;
    const confidence=Math.min(1,Math.max(...g.observations.map(o=>Number(o.confidence||0))) * (sourceCount>=minIndependentSources?1:0.75));
    return {verified:sourceCount>=minIndependentSources,independent_source_count:sourceCount,confidence,observations:g.observations};
  });
}
