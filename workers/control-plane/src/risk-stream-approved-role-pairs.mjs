/** Rights-approved publisher evidence policy shared by attesters and reviewer.
 * Radar/Telegram signals never turn into a second commercial original. */
export const APPROVED_ROLE_PAIRS=Object.freeze({
 GEOPOLITICS:Object.freeze(['GOVERNMENT_WIRE','INDEPENDENT_REGIONAL']),
 MACRO_FX:Object.freeze(['OFFICIAL_STATISTICS','MARKET_PRICE']),
 CRITICAL_MINERALS:Object.freeze(['TRADE_CUSTOMS','INDEPENDENT_INDUSTRY'])
});
const clock=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(x)?
 Date.parse(/^\d{4}-\d\d-\d\d$/.test(x)?x+'T00:00:00.000Z':x):NaN;
const validRoot=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9.-]{2,252}$/.test(x);
const validParent=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9_.:-]{1,99}$/.test(x);
export function approvedLegalAnchor(row,category,now=Date.now()){
 return Boolean(APPROVED_ROLE_PAIRS[category]?.includes(row?.source_role)&&
  row.original_verified===1&&row.enabled===1&&row.commercial_rights_approved===1&&
  validRoot(row.publisher_root_domain)&&validParent(row.parent_media_entity)&&
  Number.isFinite(clock(row.rights_expire_at))&&clock(row.rights_expire_at)>now);
}
export function hasIndependentApprovedRolePair(rows,category,now=Date.now()){
 const roles=APPROVED_ROLE_PAIRS[category];
 if(!roles||!Array.isArray(rows)||rows.length<2||rows.length>3)return false;
 const candidates=rows.filter(row=>approvedLegalAnchor(row,category,now));
 return candidates.some(a=>a.source_role===roles[0]&&candidates.some(b=>
  b.source_role===roles[1]&&a.publisher_root_domain!==b.publisher_root_domain&&
  a.parent_media_entity!==b.parent_media_entity&&
  (!a.observation_id||!b.observation_id||a.observation_id!==b.observation_id)));
}
