import {country195ByIso3} from "./canonical-country-registry-195";
/**
 * Conservative country mention matching for private original-publisher titles.
 * Verified World Bank country name is the default. Reviewed demonyms bridge
 * original headlines like "Chinese lithium" without guessed source rights.
 */
const REVIEWED_DEMONYMS: Readonly<Record<string,readonly string[]>> = Object.freeze({
  CHN:["Chinese"], IND:["Indian"], USA:["American","U.S.","US"],
  AUS:["Australian"], CAN:["Canadian"],
  JPN:["Japanese"], BRA:["Brazilian"], ZAF:["South African"],
  CHL:["Chilean"], IDN:["Indonesian"], KOR:["South Korean"],
  DEU:["German"], FRA:["French"],
  // The World Bank uses formal display names; first-party article headlines
  // commonly use these reviewed short forms. Word boundaries still apply.
  RUS:["Russia","Russian"], IRN:["Iran","Iranian"],
  // Fixed UK geography, not a rule that every GOV.UK article is about Britain.
  GBR:["British","UK","Cornwall","England","Scotland","Wales"],
  // Reviewed national demonyms commonly used in first-party macro and
  // strategic-material headlines. Word-boundary matching is still required.
  ARG:["Argentine","Argentinian"], AUT:["Austrian"], BGD:["Bangladeshi"],
  BOL:["Bolivian"], CIV:["Ivorian"], COL:["Colombian"], CRI:["Costa Rican"],
  CZE:["Czech"], DNK:["Danish"], DZA:["Algerian"], EGY:["Egyptian"],
  ETH:["Ethiopian"], FIN:["Finnish"], GHA:["Ghanaian"], GRC:["Greek"],
  HUN:["Hungarian"], IRL:["Irish"], ISR:["Israeli"], ITA:["Italian"],
  KAZ:["Kazakh"], KEN:["Kenyan"], KHM:["Cambodian"], LKA:["Sri Lankan"],
  MAR:["Moroccan"], MEX:["Mexican"], MMR:["Burmese","Myanmar"], MNG:["Mongolian"],
  MOZ:["Mozambican"], MYS:["Malaysian"], NAM:["Namibian"], NGA:["Nigerian"],
  NLD:["Dutch"], NOR:["Norwegian"], NPL:["Nepali","Nepalese"],
  NZL:["New Zealander"], PAK:["Pakistani"], PER:["Peruvian"],
  PHL:["Filipino","Philippine"], POL:["Polish"], PRT:["Portuguese"],
  RWA:["Rwandan"], SAU:["Saudi","Saudi Arabian"], SEN:["Senegalese"],
  SGP:["Singaporean"], SWE:["Swedish"], THA:["Thai"], TUR:["Turkish"],
  TZA:["Tanzanian"], UGA:["Ugandan"], UKR:["Ukrainian"], VNM:["Vietnamese"],
  ZMB:["Zambian"], ZWE:["Zimbabwean"],
});
function normalized(value:string):string {
  return value.normalize("NFKC").trim().replace(/\s+/gu," ");
}
function escaped(value:string):string {
  return [...value].map(c=>
    "\\.^$*+?()[]{}|".includes(c) ? "\\"+c : c).join("");
}
export function originalHeadlineMentionsCountry(
  title:string, countryIso3:string, verifiedOfficialName:string,
):boolean {
  if(typeof title!=="string"||title.length>300||
     !/^[A-Z]{3}$/u.test(countryIso3) ||
     typeof verifiedOfficialName!=="string" ||
     !/^[\p{L}\p{N} ,.'&()-]{2,100}$/u.test(verifiedOfficialName))
    return false;
  const clean=normalized(title);
  // Reject substrings like "Chinatown" for China and "IndiaMart" for India.
  // Offline 195-state registry supplies independently reviewed country
  // names when World Bank does not expose a country (e.g. Holy See, PSE),
  // plus bounded short-form aliases. No fuzzy/sub-string ISO3 attribution.
  // This is only country RELEVANCE, not publisher provenance or same-event
  // corroboration. A non-country ISO3 still cannot borrow country aliases.
  const registry=country195ByIso3(countryIso3);
  const terms=[verifiedOfficialName,...(registry?[registry.name,...registry.aliases]:[]),
    ...(REVIEWED_DEMONYMS[countryIso3]??[])];
  return terms.some(term=>{
    const pattern=new RegExp(
      "(?:^|[^\\p{L}\\p{N}])"+escaped(normalized(term))+
      "(?=$|[^\\p{L}\\p{N}])","iu");
    return pattern.test(clean);
  });
}
/** A publisher-authenticated US discount-rate policy release is inherently US
 * scope even if its official headline omits the literal country name. This is
 * narrowly limited to the Fed's original policy-meeting release family;
 * other publishers and topics still require an explicit country mention.
 * Issuer identity only establishes relevance, never rights or factual truth.
 */
export function originalPublisherMatchesCountry(
  title:string, summary:string, countryIso3:string,
  verifiedOfficialName:string, publisherFamily:string,
):boolean {
  if (originalHeadlineMentionsCountry(title,countryIso3,verifiedOfficialName) ||
      originalHeadlineMentionsCountry(summary.slice(0,300),countryIso3,verifiedOfficialName))
    return true;
  // RBI is India's named national monetary authority. A relevant official
  // press *title or excerpt* must still explicitly identify RBI or India;
  // issuer alone never authorizes country scope, rights, or an event claim.
  if(countryIso3==="IND" &&
     publisherFamily==="rbi_india_original_macro_publisher" &&
     /\b(?:RBI|Reserve Bank of India)\b/iu.test(title+" "+summary.slice(0,300)))
    return true;
  // Institution-native *domestic* monetary publications may omit the country
  // in the title. Preserve strict issuer, ISO3 and canonical-name binding;
  // generic issuer content and any other jurisdiction remain out of scope.
  // This is only discovery relevance. The exact HTTPS issuer article, native
  // original publication clock, rights and signatures must still be proved.
  if(countryIso3==="CAN" && verifiedOfficialName==="Canada" &&
     publisherFamily==="boc_original_publisher" &&
     /^(?:Monetary Policy Report|Policy Rate Announcement)(?:\s*[:\-–]\s*.+)?$/iu.test(title))
    return true;
  if(countryIso3==="JPN" && verifiedOfficialName==="Japan" &&
     publisherFamily==="boj_original_publisher" &&
     /^(?:Statement on Monetary Policy|Monetary Policy Decision|Outlook for Economic Activity and Prices)(?:\s*[:\-–]\s*.+)?$/iu.test(title))
    return true;
  // NBS's exact English "Latest Releases" RSS is the original China national
  // statistics bulletin stream; its release titles often omit "China" even
  // when the release is explicitly China-only. This binds source identity to
  // relevance, never to article clocks, independent claims, rights or payment.
  if(countryIso3==="CHN" && verifiedOfficialName==="China" &&
     publisherFamily==="china_nbs_original_macro_publisher")return true;
  return countryIso3==="USA" && verifiedOfficialName==="United States" &&
    publisherFamily==="us_federal_reserve_original_publisher" &&
    /^Minutes of the Board['\u2019]s discount rate meetings on\s+\S/iu.test(title);
}
