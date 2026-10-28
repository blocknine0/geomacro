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

/**
 * Independent post-write verification. An acknowledged ID alone is NOT proof
 * that the canonical journal retained the source-native publication clock or
 * the exact attributed, unscored derived payload. Never backdate/rewrite an
 * existing record or silently count a divergent revision as recovered.
 */
export function verifyWebsiteNewsCatchupReadback(archiveSignals, canonicalSignals, now, admissible, max=600){
  if(!Number.isFinite(now)||!Array.isArray(archiveSignals)||!Array.isArray(canonicalSignals)||
     typeof admissible!=="function"||!Number.isSafeInteger(max)||max<1||max>600)
    throw Error("WEBSITE_SHARED_READBACK_INPUT_INVALID");
  const eligible=new Map();
  for(const signal of archiveSignals){
    if(!signal||typeof signal.id!=="string"||!admissible(signal,now))continue;
    const previous=eligible.get(signal.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(signal))
      throw Error("WEBSITE_SHARED_READBACK_ARCHIVE_ID_CONFLICT");
    eligible.set(signal.id,signal);
  }
  if(eligible.size>max||canonicalSignals.length>max)
    throw Error("WEBSITE_SHARED_READBACK_CAP_EXCEEDED");
  const canonical=new Map();
  for(const signal of canonicalSignals){
    if(!signal||typeof signal.id!=="string"||canonical.has(signal.id))
      throw Error("WEBSITE_SHARED_READBACK_CANONICAL_INVALID");
    canonical.set(signal.id,signal);
  }
  const categories={geopolitics:0,macro:0,rare_earth:0};
  let missing=0;
  for(const [id,expected] of eligible){
    const received=canonical.get(id);
    if(!received){missing++;continue;}
    // All fields are derived-only, already independently validated before
    // ingestion. Exact comparison includes source date/precision and credits.
    if(JSON.stringify(expected)!==JSON.stringify(received))
      throw Error("WEBSITE_SHARED_READBACK_PAYLOAD_OR_NATIVE_CLOCK_DIVERGENT");
    if(!Object.hasOwn(categories,expected.category))
      throw Error("WEBSITE_SHARED_READBACK_CATEGORY_INVALID");
    categories[expected.category]++;
  }
  if(missing)throw Error("WEBSITE_SHARED_CATCHUP_READBACK_INCOMPLETE");
  return Object.freeze({
    eligible_archive_ids:eligible.size,
    matched_eligible_ids:eligible.size,
    missing_eligible_ids:0,
    counts_by_category:Object.freeze(categories),
    exact_derived_payloads_and_source_clocks_verified:true,
  });
}
