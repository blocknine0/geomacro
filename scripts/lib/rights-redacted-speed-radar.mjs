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
  claim_sha256:observation.same_event_claim_sha256,
  source_native_published_at:observation.original_published_at,
  next_action:'POLL_INDEPENDENT_APPROVED_LEGAL_ANCHOR',
  raw_source_redacted:true,licensed_source_text_included:false,
  raw_sources_not_republished:true,commercial_rights_approved:0,
  source_role:null,corroborates_commercial_standard:false,
  signed_gro_authorized:false,paid_delivery_authorized:false});
}
