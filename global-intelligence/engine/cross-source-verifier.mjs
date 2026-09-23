import {claimFingerprint} from "./claim-normalizer.mjs";
const UNTRUSTED_TELEGRAM=/TELEGRAM_EARLY_SIGNAL|telegram_osint/i;
export function verifyObservations(observations,{minIndependentSources=2}={}){
  const groups=new Map();
  for(const o of observations){
    const key=claimFingerprint(o); if(!key.replace(/\|/g,"")) continue;
    const g=groups.get(key)||{observations:[],sourceIds:new Set(),trustedSourceIds:new Set()};
    g.observations.push(o); g.sourceIds.add(o.source_id);
    if(!UNTRUSTED_TELEGRAM.test(o.source_id||"")) g.trustedSourceIds.add(o.source_id);
    groups.set(key,g);
  }
  return [...groups.values()].map(g=>({
    verified:g.trustedSourceIds.size>=minIndependentSources,
    corroborated:g.sourceIds.size>=minIndependentSources,
    independent_source_count:g.sourceIds.size,
    trusted_independent_source_count:g.trustedSourceIds.size,
    telegram_only:g.trustedSourceIds.size===0,
    observations:g.observations
  }));
}
