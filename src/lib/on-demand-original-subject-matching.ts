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
  return countryIso3==="USA" && verifiedOfficialName==="United States" &&
    publisherFamily==="us_federal_reserve_original_publisher" &&
    /^Minutes of the Board['\u2019]s discount rate meetings on\s+\S/iu.test(title);
}
