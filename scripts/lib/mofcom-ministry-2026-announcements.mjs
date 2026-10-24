/**
 * Bounded read-only SECONDARY original issuer discovery surface.
 *
 * China's Ministry of Commerce itself publishes annual announcements on
 * www.mofcom.gov.cn. This is a related first-party index, not a mirror of
 * exportcontrol.mofcom.gov.cn and NOT proof the original export-control
 * homepage recovered. Policy titles on the index give only leads, NEVER
 * exact article publication, permission, numerical risk or paid evidence.
 */
export const MOFCOM_MINISTRY_ANNOUNCEMENTS_2026=
 "https://www.mofcom.gov.cn/zcfb/blgg/gg/2026/index.html";
const linkPattern=/^\/zcfb\/blgg\/gg\/2026\/art\/2026\/art_[0-9a-f]{32}\.html$/iu;
const titleExportControl=/出口管制|出口限制|export control/iu;
const titleMinerals=/战略矿产|稀土|石墨|锑|镓|锗|钨|锂|钴|镍|关键矿产|critical mineral|rare earth/iu;
function decodeTitle(value){
 return String(value).replace(/<[^>]*>/gu," ")
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/giu," ")
  .replace(/\s+/gu," ").trim();
}
export function parseMofcomMinistryMineralAnnouncementIndex(html){
 if(typeof html!=="string" || Buffer.byteLength(html)>2*1024*1024 ||
    /<!DOCTYPE\s+[^>]*\[/iu.test(html) || /<!ENTITY/iu.test(html) ||
    !/<(?:html|body)\b/iu.test(html) ||
    !/商务部|中华人民共和国商务部/iu.test(html) ||
    !/2026年商务部公告|商务部公告列表/iu.test(html))
   throw Error("MOFCOM_MINISTRY_INDEX_SHAPE_INVALID");
 const pattern=/<a\b[^>]*href\s*=\s*["']([^"']{1,520})["'][^>]*>([\s\S]{0,900}?)<\/a>/giu;
 let inspected=0,relevant=0;
 const ids=new Set();
 for(const [,rawHref,rawTitle] of html.matchAll(pattern)){
  inspected++;
  if(inspected>300)throw Error("MOFCOM_MINISTRY_INDEX_LINK_BUDGET_EXCEEDED");
  let parsed;
  try{parsed=new URL(rawHref,MOFCOM_MINISTRY_ANNOUNCEMENTS_2026)}catch{continue;}
  if(parsed.protocol!=="https:"||parsed.hostname!=="www.mofcom.gov.cn"||
     parsed.port||parsed.username||parsed.password||parsed.hash||parsed.search||
     !linkPattern.test(parsed.pathname))continue;
  const title=decodeTitle(rawTitle);
  if(title.length<12||title.length>320||!titleExportControl.test(title)||
     !titleMinerals.test(title))continue;
  if(ids.has(parsed.pathname))continue;
  ids.add(parsed.pathname);relevant++;
 }
 if(inspected===0)throw Error("MOFCOM_MINISTRY_INDEX_NO_LINKS");
 if(relevant===0)throw Error("MOFCOM_MINISTRY_INDEX_NO_MINERAL_CONTROL_LEAD");
 return Object.freeze({
  schema:"geomacro.mofcom-ministry-index-reference.v1",
  category:"CRITICAL_MINERALS",country_iso3:"CHN",
  first_party_issuer:"china_mofcom",
  first_party_listing_page_shape_verified:true,
  inspected_link_count:inspected,
  mineral_export_control_original_article_lead_count:relevant,
  // Landing-page date is not any listed article's original timestamp.
  original_article_page_reread_verified:false,
  original_article_first_published_clock_verified:false,
  mineral_policy_impact_verified:false,
  original_exportcontrol_homepage_restored:false,
  article_specific_commercial_rights_verified:false,
  facts_and_rights_signed:false,independent_gri_signed:false,
  production_hot_data_created:false,x402_payable:false,
  private_links_titles_not_exposed:true,
 });
}