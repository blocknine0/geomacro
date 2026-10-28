/** Pure ID-based reconcile; no rights, severity, timestamps or signing are elevated. */
export function planWebsiteNewsCatchup(archiveSignals, canonicalSignals, now, admissible, max=600){
  if(!Number.isFinite(now)||!Array.isArray(archiveSignals)||!Array.isArray(canonicalSignals)||
     typeof admissible!=="function"||!Number.isSafeInteger(max)||max<1||max>600)
    throw Error("WEBSITE_SHARED_CATCHUP_INPUT_INVALID");
  const canonical=new Map();
  for(const s of canonicalSignals){
    if(!s||typeof s.id!=="string"||canonical.has(s.id))throw Error("WEBSITE_SHARED_CANONICAL_INVALID");
    canonical.set(s.id,s);
  }
  const staged=new Map();
  let divergent=0;
  for(const s of archiveSignals){
    if(!s||typeof s.id!=="string"||!admissible(s,now))continue;
    const prior=staged.get(s.id);
    if(prior&&JSON.stringify(prior)!==JSON.stringify(s))
      throw Error("WEBSITE_SHARED_ARCHIVE_ID_CONFLICT");
    staged.set(s.id,s);
  }
  if(staged.size>max)throw Error("WEBSITE_SHARED_ARCHIVE_OVER_CAP");
  const missing=[];
  for(const s of staged.values()){
    const current=canonical.get(s.id);
    if(current){
      if(JSON.stringify(current)!==JSON.stringify(s))divergent++;
    }else missing.push(s);
  }
  missing.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
  if(missing.length+canonical.size>max)
    throw Error("WEBSITE_SHARED_CANONICAL_CAPACITY_UNVERIFIED");
  return Object.freeze({missing,already_present:staged.size-missing.length,
    divergent_existing_ids:divergent,eligible_archive_ids:staged.size});
}
