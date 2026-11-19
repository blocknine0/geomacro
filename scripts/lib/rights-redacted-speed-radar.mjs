/** Unapproved/Telegram/Private OSINT: one-way, facts-only discovery pointer.
 * The radar never becomes a rights-approved source or commercial corroboration. */
export const RADAR_CATEGORY=Object.freeze({geopolitics:'GEOPOLITICS',macro:'MACRO_FX',rare_earth:'CRITICAL_MINERALS'});
const HASH=/^[a-f0-9]{64}$/;
export function redactedRightsRadar(observation){
 const c=RADAR_CATEGORY[observation?.category];
 if(!c||!/^[A-Z]{3}$/.test(observation?.country_iso3??'')||
   !HASH.test(observation?.same_event_claim_sha256??'')||
   !Number.isFinite(Date.parse(observation?.original_published_at)))
  throw Error('RIGHTS_RADAR_INVALID');
 return Object.freeze({schema:'geomacro.rights-redacted-speed-radar.v1',lane:'REDACTED_SPEED_RADAR',
  country_iso3:observation.country_iso3,category:c,
  severity_delta:Number.isFinite(observation.severity_delta)?observation.severity_delta:0,
  corroboration_count:Number.isSafeInteger(observation.corroboration_count)&&observation.corroboration_count>=0?
   observation.corroboration_count:0,
  claim_sha256:observation.same_event_claim_sha256,
  source_native_published_at:observation.original_published_at,
  next_action:'POLL_INDEPENDENT_APPROVED_LEGAL_ANCHOR',
  raw_source_redacted:true,licensed_source_text_included:false,
  raw_sources_not_republished:true,commercial_rights_approved:0,
  source_role:null,corroborates_commercial_standard:false,
  signed_gro_authorized:false,paid_delivery_authorized:false});
}

/** Stable priority order for already eligible Lane A feeds. This function
 * cannot approve a source: callers pass only the existing registry rows, and
 * rows without the registry's commercial-rights bit are never prioritized. */
export function prioritizeApprovedAnchorSources(signals,sources){
 if(!Array.isArray(signals)||!Array.isArray(sources))
  throw Error('RIGHTS_RADAR_PRIORITY_INPUT_INVALID');
 const cells=new Set(signals.filter(signal=>
  signal?.schema==='geomacro.rights-redacted-speed-radar.v1'&&
  signal.raw_source_redacted===true&&signal.licensed_source_text_included===false&&
  signal.raw_sources_not_republished===true&&signal.commercial_rights_approved===0&&
  signal.corroborates_commercial_standard===false&&signal.signed_gro_authorized===false&&
  signal.paid_delivery_authorized===false&&/^[A-Z]{3}$/u.test(signal.country_iso3??'')&&
  ['GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS'].includes(signal.category))
  .map(signal=>signal.country_iso3+'|'+signal.category));
 const ranked=sources.map((source,index)=>{
  const categories=Array.isArray(source.categories)?source.categories:[];
  const country=source.country_iso3??null;
  const eligible=source.commercial_rights_approved===1&&source.enabled===1;
  const match=eligible&&[...cells].some(cell=>{
   const [iso,category]=cell.split('|');
   return categories.includes(category)&&(country===iso||source.global===true);
  });
  return {source,index,match};
 }).sort((a,b)=>Number(b.match)-Number(a.match)||a.index-b.index);
 return Object.freeze({sources:Object.freeze(ranked.map(row=>row.source)),
  prioritized_source_ids:Object.freeze(ranked.filter(row=>row.match)
   .map(row=>row.source.source_id??row.source.name)),
  prioritized_count:ranked.filter(row=>row.match).length});
}
